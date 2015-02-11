var debug = require('debug')('utils');

exports.merge = function (a, b) {
    if (a && b) {
        for (var key in b) {
            a[key] = a[key] || b[key];
        }
    }
    return a;
};

/**
 * check whether app runs in production mode
 * @returns {boolean}
 */
var prod = (process.env.NODE_ENV === 'production');
debug('node environment production : %s', prod);

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
    debug('module name from repo %s : %s', repo, module);
    return module;
};

/**
 * local git repository location. this will be used to create symblinks
 */
var locals = process.env.LOCAL_REPO;
debug('using local git repo : %s', locals);

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
    debug('symblink command src : %s, dest : %s, pre : %s, suf : %s > %s', src, dest, pre, suf, cmd);
    return cmd;
};

exports.cmdclnln = function (src) {
    return 'find ' + (src || '.') + ' -type l -delete\n';
};

var token;
exports.token = function() {
    if(token) {
        return token;
    }
    token = process.env.CLIENT_TOKEN;
    if(!token) {
        throw 'hub token cannot be found. Please specify it with CLIENT_TOKEN property';
    }
    return token;
};