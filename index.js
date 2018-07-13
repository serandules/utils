var log = require('logger')('utils');
var nconf = require('nconf');
var AWS = require('aws-sdk');
var Redis = require('ioredis');
var format = require('string-template');

var env = nconf.get('ENV');

var redis;

var serverUrl;

exports.none = function () {

};

exports.env = function () {
    return env;
};

exports.merge = function (a, b) {
    if (a && b) {
        for (var key in b) {
            if (b.hasOwnProperty(key)) {
                a[key] = a[key] || b[key];
            }
        }
    }
    return a;
};

var config = new AWS.Config({
    accessKeyId: nconf.get('AWS_KEY'),
    secretAccessKey: nconf.get('AWS_SECRET')
});

var s3 = new AWS.S3(config);

exports.s3 = function () {
    return s3;
};

exports.resolve = function (url) {
    var protocol = url.match(/.*?:\/\//g);
    if (!protocol) {
        return url;
    }
    protocol = protocol[0];
    if (protocol === 'https://' || protocol === 'http://') {
        return url;
    }
    var serverUrl = exports.serverUrl();
    var sub = protocol.replace('://', '');
    var suffix = url.substring(protocol.length);
    return format(serverUrl, {sub: sub}) + '/' + suffix;
};

exports.bucket = function (name) {
    return env === 'production' ? name : env + '.' + name;
};

exports.redis = function () {
  if (redis) {
    return redis;
  }
  redis = new Redis(nconf.get('REDIS_URI'));
  return redis;
}

exports.serverUrl = function () {
  if (serverUrl) {
    return serverUrl;
  }
  serverUrl = nconf.get('SERVER_SSL') ? 'https' : 'http';
  serverUrl += '://' + nconf.get('SERVER_HOST');
  serverUrl += ':' + (nconf.get('SERVER_PORT') || nconf.get('PORT'));
  return serverUrl;
}