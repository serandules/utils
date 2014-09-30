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

exports.symblinks = function() {

}