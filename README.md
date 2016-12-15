Devops: Environment Variables
=============================

A set of helper functions that encapsulate our treatment of environment vars for KeystoneJS apps and help us build a useful `config` object.

## Usage

The partial code block below is taken from `config.js` in the `admyt-platform` codebase. 
It demonstrates how this library should be used in a modern KeystoneJS app.

```javascript
'use strict';

// This doesn't actually stop the config from being loaded onto clients, it's just a warning for developers
if (typeof window !== 'undefined') throw new Error(`You definitely shouldn't require ./config on the client`);


const envLib = require('@thinkmill/devops-env-vars');
const path = require('path');
const dotenv = require('dotenv');


// Determine the current APP_ENV
const APP_ENV = envLib.determineAppEnv(process.env.APP_ENV);

// Convert the APP_ENV to some handy flags
const flags = envLib.buildAppFlags(APP_ENV);

// Attempt to read the local .env file for this APP_ENV
if (!flags.IN_DEVELOPMENT) dotenv.config({ path: path.resolve(`../${APP_ENV}.env`) });

// Extract the vars defined from process.env and apply validation and defaults
const config = envLib.mergeConfig(APP_ENV, flags, process.env, {

	// In development we can default the NODE_ENV but production envs should set it themselves
	NODE_ENV: { required: !flags.IN_DEVELOPMENT, default: 'development' },

	// If not supplied, Keystone will default to localhost (ie. in dev)
	MONGO_URI: { required: !flags.IN_DEVELOPMENT, default: 'mongodb://localhost/admyt-platform' },

	// Used to encrypt user cookies; not important in dev
	JWT_TOKEN_SECRET: { required: !flags.IN_DEVELOPMENT, default: 'gottalovejwts' },

	// When not live, allow to be defaulted to a test key
	MANDRILL_API_KEY: { required: flags.IN_LIVE, default: 'testkeygoeshere' },

	// Cloudinary creds; used by Types.CloudinaryImage
	CLOUDINARY_URL: { required: flags.IN_LIVE || flags.IN_STAGING, default: 'cloudinary://862989489411169:Wp74nFvzkSPGkQHgtCBH7wN4Yik@thinkmill' },

	// S3 credentials; used by Types.S3File
	S3_BUCKET: { required: flags.IN_LIVE || flags.IN_STAGING },
	S3_KEY: { required: flags.IN_LIVE || flags.IN_STAGING },
	S3_SECRET: { required: flags.IN_LIVE || flags.IN_STAGING },

	// Urban Airship details; used to notify users
	UA_APP_KEY: { required: flags.IN_LIVE || flags.IN_STAGING },
	UA_SECRET_KEY: { required: flags.IN_LIVE || flags.IN_STAGING },
	UA_MASTER_KEY: { required: flags.IN_LIVE || flags.IN_STAGING },

	// NewRelic app monitoring
	NEW_RELIC_LICENSE_KEY: { required: flags.IN_LIVE },
	NEW_RELIC_APP_NAME: { required: flags.IN_LIVE },

	// For the eCentric payment gateway
	ECENTRIC_MERCHANT_ID: { required: flags.IN_LIVE || flags.IN_STAGING },

});

// Set any other static or derived vars (that don't need to be overridden by .env or process vars)
config.OTHER_IMPORTANT_VARS = 'blah blah'
config.FORCE_SSL = (flags.IN_LIVE || flags.IN_STAGING);

// ..

// Lock and export the config vars
module.exports = Object.freeze(config);
```

Lets step though the code above in detail.


## Client-side Inclusion

Since some of the config variables are also often needed client side, there's a temptation to simply require `config.js` there too.
This is a terrible, terrible idea; it usually exposes security-sensitive values to the end user.
The `config.js` file should simply never leave the server.
We put this warning in place as a last ditch effort to prevent accidental inclusion.

```javascript
// This doesn't actually stop the config from being loaded onto clients, it's just a warning for developers
if (typeof window !== 'undefined') throw new Error(`You definitely shouldn't require ./config on the client`);
```


## `envLib.determineAppEnv(process.env.APP_ENV)`

First, we call `determineAppEnv()`, which determines the current `APP_ENV` by inspecting the servers IP address the `APP_ENV` value supplied by `process.env` (if present):

```javascript
// Determine the current APP_ENV
const APP_ENV = envLib.determineAppEnv(process.env.APP_ENV);
```

This determination is based on the IP address ranges we use for VPCs in our deployed regions, 
(documented in the Thinkmill Wiki)[https://github.com/Thinkmill/wiki/blob/master/infrastructure/ip-addresses.md].

The valid `APP_ENV` are:

* `live`
* `staging`
* `testing`
* `development` (default)

Note this differs significantly from `NODE_ENV`, the only recognised value if which is `production`.
The conventional relationship between `NODE_ENV` and `APP_ENV` is shown in the table below.

| Environment | `APP_ENV` | `NODE_ENV` |
| ----------- | --------- | ---------- |
| live | 'live' | 'production' |
| staging | 'staging' | 'production' |
| testing | 'testing' | (`undefined` or any value != 'production') |
| development | 'development' | (`undefined` or any value != 'production') |

This may not hold for all apps, especially older apps created before our `APP_ENV` usage was codified.


## `envLib.buildAppFlags(APP_ENV)`

Once we have the `APP_ENV` we can use this function to build out a set of flags representing the different environments:

```javascript
// Convert the APP_ENV to some handy flags
const flags = envLib.buildAppFlags(APP_ENV);
```

This is totally optional but gives us a convenient convention for describing other conditions in the `config.js` file.
In `staging`, for example, the structure returned by this call would be:

```javascript  
console.log(flags);
// { IN_LIVE: false, IN_STAGING: true, IN_TESTING: false, IN_DEVELOPMENT: false }
```

## `dotenv.config(..)`

Next, standard practice is to seek out a `.env` file in the directory above the application root, named for the current `APP_ENV`:

```javascript
// Attempt to read the local .env file for this APP_ENV
if (!flags.IN_DEVELOPMENT) dotenv.config({ path: path.resolve(`../${APP_ENV}.env`) });
```

This file should contain any credentials, settings, etc. that are required for the environment but too sensitive to store in the codebase.
Mandrill API keys, merchant account credentials, live Mongo connection URIs, etc. might be required for a live system but generally aren't needed in development.
As such, the code above skips this step when `IN_DEVELOPMENT` is true.

If the `.env` file isn't found a warning will be printed to `stderr` but the app will continue to load.
See the `dotenv` [package docs](https://www.npmjs.com/package/dotenv) for the expected/supported format of this file.

**The `dotenv` package loads these variables directly into the `process.env` scope.**
This is the default behaviour of `dotenv` and actually pretty useful if you have variables used by packages that don't accept values any other way.
In it's standard usage, no other part of this process alters the `process.env` scope; we mostly work out of the `config` object, created next.

## `envLib.mergeConfig(APP_ENV, flags, process.env, rules)`

The values loaded are next verified and assembled into the `config` object:

```javascript
// Extract the vars defined from process.env and apply validation and defaults
const config = envLib.mergeConfig(APP_ENV, flags, process.env, {
	// ..
});
```

The last argument to this function give us some simple defaulting and validation functionality.
Combine with the `flags` object, it's a useful way of documenting the variables required in each environment.

In addition to the `APP_ENV` and `flags` values, **the `mergeConfig()` function will only return variables mentioned in this object**.
The `process.env` scope contains a lot of junk we don't want polluting our `config` object; this validation step acts as a whitelist.

Variables are described with a `required` flag and, optionally, a default value.
If a variable is `required` but no present in `process.env` (after the `.env` file has been processed) an error will be raised, halting the app.
If a variable is both not `required`, not supplied and a `default` is specified, the `default` will be incorporated into the object returned.

As noted above, **the `mergeConfig()` function does not modify the `process.env` scope**.
Variables that are defaulted based on the validation rules supplied will only exist in the object returned by `mergeConfig()`.

## Other Config Values

Most apps will also use a number of values that don't need to be set externally (ie. by `process.env` or the `.env` file).
Placing these in the `config` object increases maintainability by removing the need to hardcode values and logic throughout an app.

They're usually either constants or values that are derived from the other environment variables.
Some examples, adapted from various codebases, are included below.

### Static Values

Values that are constant for now but may change in future. Eg..

SodaKING product pricing:

```javascript
config.CANISTER_EXCHANGE_PRICE_PER_UNIT_IN_CENTS = 1895;
config.CANISTER_SELL_PRICE_PER_UNIT_IN_CENTS = 4495;
```

Blueshyft support contact details:

```javascript
config.FROM_EMAIL = 'support@blueshyft.com.au';
config.FROM_NAME = 'Blueshyft Support';
config.SUPPORT_PHONE_NUMBER = '1800 817 483';
```

### Addressing External Systems

Many (all?) Thinkmill apps rely on external systems that differ between environments (`APP_ENV`).
This is especially true in for blueshyft, where requests often require the cooperation of shared 
internal services (such as the core, transaction engine, etc) and external services (such as remote partner APIs).

#### blueshyft Apps

For the blueshyft network of apps, the 
[`@thinkmill/blueshyft-network` package](https://www.npmjs.com/package/@thinkmill/blueshyft-network) 
was developed to centralise the addressing of apps across environments.
Usage of the package looks like this:

```javascript
const network = require('@thinkmill/blueshyft-network');

// Pull in any vars we want for the network config (for this APP_ENV) and merge them into our config
config = Object.assign(config, network.getVars(APP_ENV, [
	'CORE_API_URL',
	'PCA_TRANSACTIONS_API_URL',
	'TLS_ECOSYSTEM',
]));
```

See the [package docs](https://www.npmjs.com/package/@thinkmill/blueshyft-network) for details.

#### Non-blueshyft Apps

In non-blueshyft systems, an implementation pattern has evolved to define a set of values while maintaining readability.

```javascript
config.PLUMBUS_API_URL = ({
	live:          'https://api.plumbus.net.au',
	staging:       'https://api-staging.plumbus.net.au',
	testing:       'https://api-testing.plumbus.net.au',
	development:   'http://localhost:7634',  // Plumbus stub server
})[APP_ENV];
```

Since both these approaches add values directly to the config object (without using `mergeConfig()`), 
values set in this way can't be overridden/set without code changes.


### Feature Flags

It's often useful to control specific code branches with individual flags.
These examples taken from the `blueshyft-transactions-api` codebase:

```javascript
// Are we disabling developer authentication to developer endpoints?
config.ALLOW_UNAUTHENTICATED_ACCESS_TO_DEVELOPER_ENDPOINTS = IN_DEVELOPMENT;

// Can calls to the /sweeps/create end point specify the sweepday used or do we exclusively rely on getNextSweepday()
config.ALLOW_SWEEPDAY_TO_BE_SPECIFIED_ON_CREATE = true;

// Can sweeps be 'reset' after email generation has started
config.ALLOW_RESET_AFTER_EMAIL_GENERATION = !IN_LIVE;
```

## Exporting the Values

The final lines in our example export the `config` object we've created for use by the app after 
[freezing](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze) it.
This prevents any other part of the application from accidenally making changes to this object.

```javascript
// Lock and export the config vars
module.exports = Object.freeze(config);
```

