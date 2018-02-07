Devops: Environment Variables
================================================================================

A set of helper functions that encapsulate our treatment of environment vars for KeystoneJS apps and help us build a useful `config` object.


Usage
--------------------------------------------------------------------------------

The code block below demonstrates how this library can be used in a fictional KeystoneJS app, the `chumble-platform`.

```js
const envLib = require('@thinkmill/devops-env-vars');
const path = require('path');
const dotenv = require('dotenv');


// This doesn't actually stop the config from being loaded onto clients, it's just a warning for developers
if (typeof window !== 'undefined') throw new Error(`You definitely shouldn't require ./config on the client`);

// Determine the current APP_ENV
const APP_ENV = envLib.determineAppEnv(
	process.env.APP_ENV,
	[{ cidr: '72.67.5.0/16', env: 'live' }, { cidr: '72.68.5.0/16', env: 'staging' }, { cidr: '72.69.5.0/16', env: 'testing' }],
);

// Convert the APP_ENV to some handy flags
const flags = envLib.buildAppFlags(APP_ENV);

// Attempt to read the local .env file for this APP_ENV
if (!flags.IN_DEVELOPMENT) dotenv.config({ path: path.resolve(`../${APP_ENV}.env`) });

// Extract the vars defined from process.env and apply validation and defaults
const config = envLib.mergeConfig(APP_ENV, flags, process.env, {

	// In development we can default the NODE_ENV but production envs should set it themselves
	NODE_ENV: { required: !flags.IN_DEVELOPMENT, default: 'development' },

	// If not supplied, Keystone will default to localhost (ie. in dev)
	MONGO_URI: { required: flags.IN_PRODUCTION, default: 'mongodb://localhost/chumble-platform' },

	// Used to encrypt user cookies; not important in dev
	JWT_TOKEN_SECRET: { required: flags.IN_PRODUCTION, default: 'dev-secret-goes-here' },

	// When not live, allow to be defaulted to a test key
	MANDRILL_API_KEY: { required: flags.IN_PRODUCTION, default: 'test-key-goes-here' },

	// Cloudinary creds; used by Types.CloudinaryImage
	CLOUDINARY_URL: { required: flags.IN_PRODUCTION, default: 'cloudinary://012345678902345:9FDRoGKGpYZVASNDwyTdJRKOIku@thinkmill' },

	// S3 credentials; used by Types.S3File
	S3_BUCKET: { required: flags.IN_PRODUCTION },
	S3_KEY: { required: flags.IN_PRODUCTION },
	S3_SECRET: { required: flags.IN_PRODUCTION },

	// Urban Airship details; used to notify users
	UA_APP_KEY: { required: flags.IN_PRODUCTION },
	UA_SECRET_KEY: { required: flags.IN_PRODUCTION },
	UA_MASTER_KEY: { required: flags.IN_PRODUCTION },

	// NewRelic app monitoring
	NEW_RELIC_LICENSE_KEY: { required: flags.IN_PRODUCTION },
	NEW_RELIC_APP_NAME: { required: flags.IN_PRODUCTION },

	// What port should the webserver bind to
	PORT: { required: flags.IN_PRODUCTION, default: 3000, type: Number },

});

// Support details
config.FROM_EMAIL = 'support@chumble.com.au';
config.FROM_NAME = 'Chumble Support';
config.SUPPORT_PHONE_NUMBER = '1800 422 554';

// Where should we address the plumbus API
config.PLUMBUS_API_URL = ({
	live:          'https://api.plumbus.net.au',
	staging:       'https://api-staging.plumbus.net.au',
	testing:       'https://api-testing.plumbus.net.au',
	development:   'http://localhost:7634',  // Use a local stub server in dev
})[APP_ENV];

// Are we disabling developer authentication to developer endpoints?
config.ALLOW_UNAUTHENTICATED_ACCESS_TO_DEVELOPER_ENDPOINTS = IN_DEVELOPMENT;

// Can calls to the /ploobis/create endpoint specify their own fleeb?
config.ALLOW_FLEEB_TO_BE_SPECIFIED_ON_CREATE = true;

// Can ploobis be reset even after email generation has commenced
config.ALLOW_PLOOBIS_RESET_AFTER_EMAIL_GENERATION = !IN_LIVE;


// Freeze and export the config vars
module.exports = Object.freeze(config);
```

Lets step though the code above in detail..


Client-side Inclusion
--------------------------------------------------------------------------------

Since some of the config variables are also often needed client side, there's a temptation to simply require `config.js` there too.
This is a terrible idea for, hopefully, obvious reasons; it almost certainly exposes security-sensitive values to the end user.
We put this warning in place as a last ditch effort to prevent accidental inclusion.

```js
// This doesn't actually stop the config from being loaded onto clients, it's just a warning for developers
if (typeof window !== 'undefined') throw new Error(`You definitely shouldn't require ./config on the client`);
```


`envLib.determineAppEnv(process.env.APP_ENV)`
--------------------------------------------------------------------------------

We call `determineAppEnv()` to determines the current `APP_ENV`.

```js
// Determine the current APP_ENV
const APP_ENV = envLib.determineAppEnv(
	process.env.APP_ENV,
	[{ cidr: '72.67.5.0/16', env: 'live' }, { cidr: '72.68.5.0/16', env: 'staging' }, { cidr: '72.69.5.0/16', env: 'testing' }],
);
```
It inspects the servers IP address the `APP_ENV` value supplied by `process.env` (if present).

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


`envLib.buildAppFlags(APP_ENV)`
--------------------------------------------------------------------------------

Once we have the `APP_ENV` we can use this function to build out a set of flags representing the different environments:

```js
// Convert the APP_ENV to some handy flags
const flags = envLib.buildAppFlags(APP_ENV);
```

This is optional but gives us a convenient convention for describing other conditions in the `config.js` file.

One flag is created for each environment the app supports (usually 'live', 'staging', 'testing' and 'development')
plus a flag for 'production', which is true if the environment is 'live' or 'staging'.

For example, if the `APP_ENV` was `staging`, the structure returned by the call above would be:

```js
console.log(flags);
// { IN_LIVE: false, IN_STAGING: true, IN_TESTING: false, IN_DEVELOPMENT: false, IN_PRODUCTION: true }
```


`dotenv.config(..)`
--------------------------------------------------------------------------------

Standard practice is to seek out a `.env` file in the directory above the application root, named for the current `APP_ENV`:

```js
// Attempt to read the local .env file for this APP_ENV
if (!flags.IN_DEVELOPMENT) dotenv.config({ path: path.resolve(`../${APP_ENV}.env`) });
```

This file should contain any variables required for the environment but security sensitive, so not store in the repo.
Eg. Mandrill API keys, merchant account credentials, Mongo DB URIs, etc.
Often these can be defaulted in development environments.
The code above skips this step when `IN_DEVELOPMENT` is true.

If the `.env` file isn't found a warning will be printed to `stderr` but the app will continue to load.
See the `dotenv` [package docs](https://www.npmjs.com/package/dotenv) for the expected/supported format of this file.

**IMPORTANT:**

The `dotenv` package loads these variables directly into the `process.env` scope.
This is the default behaviour of `dotenv` and actually pretty useful if you have variables used by packages that don't accept values any other way.
In it's standard usage, no other part of this process alters the `process.env` scope; we mostly work out of the `config` object, created next.


`envLib.mergeConfig(APP_ENV, flags, process.env, rules)`
--------------------------------------------------------------------------------

The values loaded are next verified and assembled into the `config` object:

```js
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

Variables definitions can optionally include a `type`, being either `Boolean`, `Number` or `String` (or unspecified).
If supplied, the value given by the environment will be interpreted as this type.
If an appropriate value can't be unambiguously determined (eg. a value of "coffee" suppled for a `Boolean` value) an error will be thrown.

**IMPORTANT:**

As noted above, the `mergeConfig()` function does not modify the `process.env` scope.
Variables that are defaulted based on the validation rules supplied will only exist in the object returned by `mergeConfig()`.


Other Config Values
--------------------------------------------------------------------------------

Most apps will also use a number of values that don't need to be set externally (ie. by `process.env` or the `.env` file).
Placing these in the `config` object increases maintainability by removing the need to hardcode values and logic throughout an app.

They're usually either constants or values that are derived from the other environment variables.

### Examples

Support contact details:

```js
// Support details
config.FROM_EMAIL = 'support@chumble.com.au';
config.FROM_NAME = 'Chumble Support';
config.SUPPORT_PHONE_NUMBER = '1800 422 554';
```

An the URL of an external system based on the current `APP_ENV`:

```js
// Where should we address the plumbus API
config.PLUMBUS_API_URL = ({
	live:          'https://api.plumbus.net.au',
	staging:       'https://api-staging.plumbus.net.au',
	testing:       'https://api-testing.plumbus.net.au',
	development:   'http://localhost:7634',  // Use a local stub server in dev
})[APP_ENV];
```

It can be useful to control specific functionality with feature flags:

```js
// Are we disabling developer authentication to developer endpoints?
config.ALLOW_UNAUTHENTICATED_ACCESS_TO_DEVELOPER_ENDPOINTS = IN_DEVELOPMENT;

// Can calls to the /ploobis/create endpoint specify their own fleeb?
config.ALLOW_FLEEB_TO_BE_SPECIFIED_ON_CREATE = true;

// Can ploobis be reset even after email generation has commenced
config.ALLOW_PLOOBIS_RESET_AFTER_EMAIL_GENERATION = !IN_LIVE;
```


Exporting the Values
--------------------------------------------------------------------------------

In this example we [freeze](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)
the config object before exporting it for use in our app.
This goes some way towards preventing other parts of the application from unintentionally setting config values.

```js
// Freeze and export the config vars
module.exports = Object.freeze(config);
```
