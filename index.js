'use strict';

const chalk = require('chalk');
const debugLib = require('debug');
const Netmask = require('netmask').Netmask;
const os = require('os');


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

/*
	Figures out which APP_ENV to use, based on the value supplied, the supported envs and the servers IP address

	networksArray is expected in the format..
	[{ cidr: '72.67.5.0/16', env: 'live' }, { cidr: '72.68.5.0/16', env: 'staging' }, { cidr: '72.69.5.0/16', env: 'testing' }]
*/
function determineAppEnv (_processAppEnv, networksArray = []) {
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
	const candidateNetworks = networksArray.filter(network => new Netmask(network.cidr).contains(serverIp) && SUPPORTED_ENVS.includes(network.env));
	if (candidateNetworks.length > 1) throw new Error(`Server IP matches > 1 potential network: ${candidateNetworks.map(network => (`${network.env} ${network.cidr}`)).join('; ')}`);

	let envRtn = 'development';
	if (candidateNetworks.length === 1) {
		debug(`APP_ENV determined from server IP as ${chalk.cyan(candidateNetworks[0].env)} (${chalk.green(serverIp)} is within ${chalk.green(candidateNetworks[0].cidr)})`);
		envRtn = candidateNetworks[0].env;
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
};
