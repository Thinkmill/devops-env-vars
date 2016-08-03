/*

USAGE:
		
	const envVars = require('@thinkmill/devops-env-vars');

	const c = envVars.collectEnvVars(process.env, ['live', 'staging', 'development']);
	const config = envVars.mergeConfig(c, {

		// In development we can default the NODE_ENV but production envs should set it themselves
		NODE_ENV: { required: !c.IN_DEVELOPMENT, default: 'development' },
		
		// .. 
	});
	
 */

'use strict';

const chalk = require('chalk');
const debugLib = require('debug');
const dotenv = require('dotenv');
const fs = require('fs');
const Netmask = require('netmask').Netmask;
const os = require('os');
const path = require('path');


// Configure the VPC's in different AWS regions
const VPC_IP_RANGES = {
	// Sydney (ap-southeast-2)
	'10.117.0.0/16': 'live',
	'10.118.0.0/16': 'staging',
	'10.119.0.0/16': 'testing',
	
	// Ireland (eu-west-1)
	'10.130.0.0/16': 'live',
	'10.132.0.0/16': 'testing',
	'10.131.0.0/16': 'staging',	
};


// Clean and default an array of environments that might be supported
function cleanSupportedEnvs (envs) {
	const debug = debugLib('@thinkmill/devops-env-vars:cleanSupportedEnvs');
	const valid = ['live', 'staging', 'testing', 'development'];
	if (!envs || Array.isArray(envs)) return valid;
	const clean = envs.filter(env => valid.includes(env));
	debug(`Supported environments cleaned to: ${chalk.cyan(clean.join(', '))}`)
	return clean;
}


// Function to get the local ip address of the current server
// Only works for IPv4; assumes a single external IP per server
function getServerIp () {
	const debug = debugLib('@thinkmill/devops-env-vars:getServerIp');
	const ifaces = os.networkInterfaces();
	
	var values = Object.keys(ifaces).map(function (name) {
		return ifaces[name];
	});

	values = [].concat.apply([], values).filter(function (val) {
		return val.family === 'IPv4' && val.internal === false;
	});
	
	const serverIp = values.length ? values[0].address : '0.0.0.0';
	debug(`Server IP identified as ${chalk.cyan(serverIp)}`);
	return serverIp;
}


// Figures out which APP_ENV to use, based on the value supplied, the supported envs and the servers IP address
function determineAppEnv (_processAppEnv, supportedEnvs) {
	const debug = debugLib('@thinkmill/devops-env-vars:determineAppEnv');
	
	// Validate the supplied process APP_ENV
	const processAppEnv = (supportedEnvs.indexOf(_processAppEnv) > -1) ? _processAppEnv : undefined;
	
	// User supplied is give precedence
	if (processAppEnv) {
		debug(`APP_ENV specifed by process.env as ${chalk.cyan(processAppEnv)}`);
		return processAppEnv;
	}
	
	// If the servers ip exists in one of the defined subnets, return that environment
	const serverIp = getServerIp();
	var envRtn = 'development';
	
	Object.keys(VPC_IP_RANGES).forEach(cidr => {
		const cidrEnv = VPC_IP_RANGES[cidr];
		if (new Netmask(cidr).contains(serverIp) && supportedEnvs.includes(cidrEnv)) {
			debug(`APP_ENV determined from server IP as ${chalk.cyan(cidrEnv)} (${chalk.green(serverIp)} is within ${chalk.green(cidr)})`);
			envRtn = cidrEnv;
		}
	});
	
	// Default to development
	debug(`APP_ENV returning as ${chalk.cyan(envRtn)}`);
	return envRtn;
}


// Build a set of flag constants; one for each supported environment
function buildAppFlags (appEnv, supportedEnvs) {
	var flags = {};
	supportedEnvs.forEach(env => flags[`IN_${env.toUpperCase()}`] = (env === appEnv));
	return flags;
}


// Attempts to read a local .env file for the current APP_ENV
// These usually hold security sensitive values specific to the environment (ie. that we don't want in git)
// function readFileVars (envFilePath) {
// 	const debug = debugLib('@thinkmill/devops-env-vars:readFileVars');
// 	debug(`Attempting to read local .env from ${chalk.cyan(envFilePath)}`);
	
// 	// Attempt to read the file
// 	try {
// 		const file = fs.readFileSync(envFilePath);
		
// 		// We use the parse() method here; if parses the .env format but doens't inject the result into process.env
// 		const cont = dotenv.parse(file);
		
// 		debug(`Success - Local .env vars loaded from ${chalk.cyan(envFilePath)}`);
// 		return cont;
// 	}
// 	catch (e) {
// 		debug(`Failure - Local .env vars not found at ${chalk.cyan(envFilePath)}. Error was: `, e.message);
// 		return {};
// 	}
// }


// Handles the logic of merging, validating and defaulting the config vars
function mergeConfig (appEnv, appFlags, processEnv, rules) {
	const debug = debugLib('@thinkmill/devops-env-vars:mergeConfig')
	const ruleKeys = Object.keys(rules);
	
	var config = {};
	
	for (let i = 0; i < ruleKeys.length; i++) {
		const varName = ruleKeys[i];
		const varRule = rules[varName];
		
		if (processEnv.hasOwnProperty(varName)) {
			debug(`${chalk.cyan(varName)} setting from processEnv: '${chalk.yellow(processEnv[varName])}'`);
			config[varName] = processEnv[varName];
		}
		
		if (varRule.required && !config.hasOwnProperty(varName)) {
			debug(`${chalk.cyan(varName)} not set and required; throwing error...`);
			throw new Error(`Environment var validation: The var '${varName}' is marked as required but has not been supplied.`);
		}
		
		if (varRule.hasOwnProperty('default') && !config.hasOwnProperty(varName)) {
			debug(`${chalk.cyan(varName)} not set; defaulting to ${chalk.red(varRule.default)}`);
			config[varName] = varRule.default;
		}
	}
	
	// Add the APP_ENV and flags
	Object.assign(config, appFlags, { APP_ENV: appEnv });
	
	debug(`Finald config:`, config);
	return config;
}


// Export the ip and the subnet check function
module.exports = { cleanSupportedEnvs, getServerIp, determineAppEnv, buildAppFlags, mergeConfig };
