var log = require('logger')('utils');
var nconf = require('nconf');
var AWS = require('aws-sdk');

var server = nconf.get('server');

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

/**
 * check whether app runs in production mode
 * @returns {boolean}
 */
var prod = process.env.PRODUCTION;
log.debug('node environment production : %s', prod);

exports.prod = function () {
    return prod;
};

/**
 * extract out module name from the git repo url
 * @param repo
 * @returns {string}
 */
exports.module = function (repo) {
    var idx = repo.lastIndexOf('/');
    repo = repo.substring(idx + 1);
    var module = repo.substring(0, repo.indexOf('.'));
    log.debug('module name from repo %s : %s', repo, module);
    return module;
};

/**
 * local git repository location. this will be used to create symblinks
 */
var locals = process.env.LOCAL_REPO;
log.debug('using local git repo : %s', locals);

exports.locals = function () {
    return locals;
};

/**
 * returns shell command for creating symbolic links from src to dest. pre and suf are used to
 * build the link name
 * @param src
 * @param dest
 * @param pre
 * @param suf
 */
exports.cmdln = function (src, dest, pre, suf) {
    var cmd = 'for dir in ' + src + '/*; do rm -rf ' + dest + '/'
        + (pre ? pre : '') + '$(basename "$dir")' + (suf ? suf : '') + ';';
    cmd += 'ln -s ' + src + '/$(basename "$dir") ' + dest + '/'
        + (pre ? pre : '') + '$(basename "$dir")' + (suf ? suf : '') + '; done;\n';
    log.debug('symblink command src : %s, dest : %s, pre : %s, suf : %s > %s', src, dest, pre, suf, cmd);
    return cmd;
};

exports.cmdclnln = function (src) {
    return 'find ' + (src || '.') + ' -type l -delete\n';
};

var token;
exports.token = function () {
    if (token) {
        return token;
    }
    token = process.env.CLIENT_TOKEN;
    if (!token) {
        throw 'hub token cannot be found. Please specify it with CLIENT_TOKEN property';
    }
    return token;
};

var s3;
exports.s3 = function () {
    if (s3) {
        return s3;
    }
    AWS.config.update({
        accessKeyId: process.env.AWS_KEY,
        secretAccessKey: process.env.AWS_SECRET,
        region: process.env.AWS_REGION || 'ap-southeast-1'
    });
    return s3 = new AWS.S3();
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