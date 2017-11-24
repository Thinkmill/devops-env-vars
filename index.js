'use strict';

const chalk = require('chalk');
const debugLib = require('debug');
const Netmask = require('netmask').Netmask;
const os = require('os');


// Configure the VPC's in different AWS regions
const AWS_VPCS = [

	// Thinkmill Sydney (ap-southeast-2)
	{ cidr: '10.117.0.0/16', env: 'live' },
	{ cidr: '10.118.0.0/16', env: 'staging' },
	{ cidr: '10.119.0.0/16', env: 'testing' },
	// Also.. 10.97.0.0/16 Blueshyft XIT

	// Thinkmill Ireland (eu-west-1)
	{ cidr: '10.130.0.0/16', env: 'live' },
	{ cidr: '10.131.0.0/16', env: 'staging' },
	{ cidr: '10.132.0.0/16', env: 'testing' },

	// blueshyft Sydney (ap-southeast-2)
	{ cidr: '10.20.0.0/16', env: 'live' },
	{ cidr: '10.21.0.0/16', env: 'staging' },
	{ cidr: '10.22.0.0/16', env: 'testing' },
	// Also.. 10.30.0.0/16 XIT
];

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
	const possibleVpcs = AWS_VPCS.filter(vpc => new Netmask(vpc.cidr).contains(serverIp) && SUPPORTED_ENVS.includes(vpc.env));
	if (possibleVpcs.length > 1) throw new Error(`Server IP matches > 1 potential VPC: ${possibleVpcs.map(vpc => (`${vpc.env} ${vpc.cidr}`)).join('; ')}`);

	let envRtn = 'development';
	if (possibleVpcs.length === 1) {
		debug(`APP_ENV determined from server IP as ${chalk.cyan(possibleVpcs[0].env)} (${chalk.green(serverIp)} is within ${chalk.green(possibleVpcs[0].cidr)})`);
		envRtn = possibleVpcs[0].env;
	}

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

	// Add the IN_PRODUCTION flag which covers the live and staging environments
	flags.IN_PRODUCTION = (flags.IN_LIVE || flags.IN_STAGING);

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
		let supplied;

		if (processEnv.hasOwnProperty(varName)) {
			debug(`${chalk.cyan(varName)} setting from processEnv: '${chalk.yellow(processEnv[varName])}'`);
			supplied = processEnv[varName];
		}

		if (varRule.required && typeof supplied === 'undefined') {
			debug(`${chalk.cyan(varName)} not set and required; throwing error...`);
			throw new Error(`Environment var validation: The var '${varName}' is marked as required but has not been supplied.`);
		}

		if (varRule.hasOwnProperty('default') && typeof supplied === 'undefined') {
			debug(`${chalk.cyan(varName)} not set; defaulting to ${chalk.red(varRule.default)}`);
			supplied = varRule.default;
		}

		// Coerce the value to the type specifed (if specified)
		if (varRule.hasOwnProperty('type')) {
			const suppliedStr = supplied.toString().toLowerCase();
			const suppliedNum = parseInt(suppliedStr);
			// Error if the value supplied can't be clearly interpreted as the correct type

			if (varRule.type === Boolean) {
				if (typeof supplied !== 'boolean' && !['yes', 'true', 'y', 't', 'false', 'no', 'f', 'n'].includes(suppliedStr) && isNaN(suppliedNum)) {
					throw new Error(`Environment var supplied for '${varName}' is defined as a Boolean but the value supplied can't be reliably interpreted as one`);
				}
				supplied = (supplied === true || ['yes', 'true', 'y', 't'].includes(suppliedStr) || suppliedNum > 0 || suppliedNum < 0);
			}
			else if (varRule.type === Number) {
				if (isNaN(suppliedNum)) {
					throw new Error(`Environment var supplied for '${varName}' is defined as a Number but the value supplied can't be reliably interpreted as one`);
				}
				supplied = suppliedNum;
			}
			else if (varRule.type === String) {
				if (supplied !== suppliedStr) {
					throw new Error(`Environment var supplied for '${varName}' is defined as a String but the value supplied can't be reliably interpreted as one`);
				}
			}
			else {
				throw new Error(`Environment var '${varName}' specifies an unrecognised type: '${varRule.type.name}'`);
			}
		}

		config[varName] = supplied;
	}

	// Add the APP_ENV and flags
	Object.assign(config, appFlags, { APP_ENV: appEnv });

	debug(`Finald config:`, config);
	return config;
}


// Export the ip and the subnet check function
module.exports = {
	getServerIp,
	determineAppEnv,
	buildAppFlags,
	mergeConfig,
	supportedEnvs: SUPPORTED_ENVS,
	awsVpcs: AWS_VPCS,
};
