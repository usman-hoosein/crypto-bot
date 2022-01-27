const creds = require("../creds.json");
const crypto = require("crypto");
const qs = require("qs");
const axios = require('axios');

// Cb credentials
var cb_url = creds.cb_url
var cb_access_key = creds.cb_access_key
var cb_access_passphrase = creds.cb_access_passphrase
var cb_access_secret = creds.cb_access_secret

// Read Kraken API key and secret stored in environment variables
var kr_url = "https://api.kraken.com"
var kr_key = creds.key
var kr_sec = creds.secret
var kr_version = 0
var nonceNum = new Date() * 1000

let authenticate = (exchange, uri_path_type, method, bodyParams) => {
    let returnObj = { uri_path: "", url: "", bodyParams: bodyParams, headers: {} }
    if (exchange == 'coinbase' || exchange == 'cb') {
        returnObj.uri_path = "/" + uri_path_type
        returnObj.url = cb_url + returnObj.uri_path

        returnObj.headers = cbAuthenticate(method, returnObj.uri_path, returnObj.bodyParams)
        returnObj.headers["Accept"] = "application/json"
        returnObj.headers["Content-type"] = "application/json"
    }
    else if (exchange == 'kraken' || exchange == 'kr') {
        if (!returnObj.bodyParams.nonce) {
            returnObj.bodyParams.nonce = nonceNum
        }

        if (method == 'POST') {
            returnObj.uri_path = '/' + kr_version + '/private/' + uri_path_type
        }
        else {
            returnObj.uri_path = '/' + kr_version + '/public/' + uri_path_type
        }
        returnObj.url = kr_url + returnObj.uri_path

        returnObj.headers['User-Agent'] = 'Kraken Javascript API Client'
        returnObj.headers['API-Key'] = kr_key
        returnObj.headers['API-Sign'] = krSignature(returnObj.uri_path, returnObj.bodyParams, kr_sec, nonceNum)
    }
    else {
        throw 'Incorrect Exchange'
    }
    return returnObj
}

let cbAuthenticate = (method, uri_path, bodyParams) => {
    let headers = {}
    if (bodyParams && Object.keys(bodyParams).length == 0) {
        bodyParams = null
    }
    let client = cbSignature(method, uri_path, bodyParams)
    headers["cb-access-key"] = client.key
    headers["cb-access-sign"] = client.signature
    headers["cb-access-timestamp"] = client.timestamp
    headers["cb-access-passphrase"] = client.passphrase
    return headers
}

let cbSignature = (method, path, options) => {
    const timestampTemp = Date.now() / 1000;
    let body = '';
    if (options) {
        body = JSON.stringify(options);
    }
    // } else if (options.qs && Object.keys(options.qs).length !== 0) {
    //     body = '?' + querystring.stringify(options.qs);
    // }
    const what = timestampTemp + method + path + body;
    const key = Buffer.from(cb_access_secret, 'base64');
    const hmac = crypto.createHmac('sha256', key);
    const signature = hmac.update(what).digest('base64');
    return {
        key: cb_access_key,
        signature: signature,
        timestamp: timestampTemp,
        passphrase: cb_access_passphrase,
    }
}

const krSignature = (path, request, secret, nonce) => {
    const message = qs.stringify(request);
    const secret_buffer = new Buffer(secret, 'base64');
    const hash = new crypto.createHash('sha256');
    const hmac = new crypto.createHmac('sha512', secret_buffer);
    const hash_digest = hash.update(nonce + message).digest('binary');
    const hmac_digest = hmac.update(path + hash_digest, 'binary').digest('base64');

    return hmac_digest;
};

let post = async (uri_path_type, exchange, bodyRequest = null, method = 'POST') => {
    let bodyParams = bodyRequest || {}
    let client = authenticate(exchange, uri_path_type, method, bodyParams)
    let url = client.url
    let headers = client.headers
    bodyParams = client.bodyParams

    let options = { headers }
    Object.assign(options, {
        body: qs.stringify(bodyParams),
        method: method,
        timeout: 2000,
    })

    try {
        const res = await apiWithTimeout(axios.post, url, bodyParams, options, 2000, 'POST')
        return res.data
    }
    catch (e) {
        console.log(e.response.data)
        throw e
    }
}

const get = async (uriPathType, exchange, doesRequireAuth = false) => {
    let result = authenticate(exchange, uriPathType, 'GET', {})
    let url = result.url
    let headers = {}

    if (doesRequireAuth) {
        headers = result.headers
    }

    let options = { headers }
    Object.assign(options, {
        timeout: 2000,
        "Retry-After": 60
    })

    try {
        const res = await apiWithTimeout(axios.get, url, {}, options, 2000)
        return res.data
    }
    catch (e) {
        if (e.message != 'Request failed with status code 404') {
            console.log("Client Get: " + e.message + "; " + uriPathType)
        }
        if (e.code == 'ECONNABORTED') {
            return 'timeout'
        }
        return e
    }
}

const apiWithTimeout = async (httpReq, url, bodyParams, options, milliseconds, method = 'GET') => {
    if (method == 'GET') {
        return await new Promise(function (resolve, reject) {
            setTimeout(function () {
                reject(new Error("Data fetch failed in " + milliseconds + " ms"))
            }, milliseconds)
            httpReq(url, options)
                .then(res => { resolve(res) })
                .catch(err => { reject(err) })
        })
    }
    else {
        return await new Promise(function (resolve, reject) {
            setTimeout(function () {
                reject(new Error("Data fetch failed in " + milliseconds + " ms"))
            }, milliseconds)
            httpReq(url, bodyParams, options)
                .then(res => { resolve(res) })
                .catch(err => { reject(err) })
        })
    }
};

module.exports = {
    post: post, get: get,
}