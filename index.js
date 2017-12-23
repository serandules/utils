var log = require('logger')('utils');
var nconf = require('nconf');
var AWS = require('aws-sdk');

var server = nconf.get('SERVER');

var env = nconf.get('ENV');

exports.none = function () {

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
    var sub = protocol.replace('://', '');
    var suffix = url.substring(protocol.length);
    return server.replace('{sub}', sub) + '/' + suffix;
};

exports.bucket = function (name) {
    return env === 'production' ? name : env + '.' + name;
};