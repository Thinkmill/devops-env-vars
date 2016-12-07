'use strict';

const chalk = require('chalk');
const debugLib = require('debug');
const Netmask = require('netmask').Netmask;
const os = require('os');


// Configure the VPC's in different AWS regions
const VPC_IP_RANGES = {
	// Sydney (ap-southeast-2)
	'10.117.0.0/16': 'live',
	'10.118.0.0/16': 'staging',
	'10.119.0.0/16': 'testing',

	// Ireland (eu-west-1)
	'10.130.0.0/16': 'live',
	'10.131.0.0/16': 'staging',
	'10.132.0.0/16': 'testing',
};

// The different environments we support
const SUPPORTED_ENVS = ['live', 'staging', 'testing', 'development'];


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
function determineAppEnv (_processAppEnv) {
	const debug = debugLib('@thinkmill/devops-env-vars:determineAppEnv');

	// Validate the supplied process APP_ENV
	const processAppEnv = (SUPPORTED_ENVS.indexOf(_processAppEnv) > -1) ? _processAppEnv : undefined;

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
		if (new Netmask(cidr).contains(serverIp) && SUPPORTED_ENVS.includes(cidrEnv)) {
			debug(`APP_ENV determined from server IP as ${chalk.cyan(cidrEnv)} (${chalk.green(serverIp)} is within ${chalk.green(cidr)})`);
			envRtn = cidrEnv;
		}
	});

	// Default to development
	debug(`APP_ENV returning as ${chalk.cyan(envRtn)}`);
	return envRtn;
}


// Build a set of flag constants; one for each supported environment
function buildAppFlags (appEnv) {
	var flags = {};
	SUPPORTED_ENVS.forEach(env => {
		flags[`IN_${env.toUpperCase()}`] = (env === appEnv);
	});
	return flags;
}


// Handles the logic of merging, validating and defaulting the config vars
function mergeConfig (appEnv, appFlags, processEnv, rules) {
	const debug = debugLib('@thinkmill/devops-env-vars:mergeConfig');
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
module.exports = { getServerIp, determineAppEnv, buildAppFlags, mergeConfig };
