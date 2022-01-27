const fs = require('fs')
const path = require('path')
const algos = require('../../bot/controllers/algos')

exports.getIndex = (req, res, next) => {
    let tokenStr = fs.readFileSync(path.join(__dirname, '../../data', 'tokens.json'))
    let tokens = JSON.parse(tokenStr)
    let accInfoStr = fs.readFileSync(path.join(__dirname, '../../data', 'accInfo.json'))
    let accInfo

    if (accInfoStr != '') {
        accInfo = JSON.parse(accInfoStr)
    }
    else {
        accInfo = {}
    }

    let purchased = {}
    for (let token in tokens) {
        if (tokens[token].purchased) {
            purchased[token] = tokens[token]
        }
    }
    for (let token in purchased) {
        purchased[token].currGL = (((purchased[token].curr / purchased[token].purchasedPrice) - 1) * 100).toFixed(2)
        purchased[token].decayRate *= 100
        purchased[token].decayRate = purchased[token].decayRate.toFixed(2)
    }

    let currentTime = algos.cbTimestamp()

    res.render('index', {
        pageTitle: 'Index',
        path: '/',
        tokens: purchased,
        accInfo: accInfo,
        currentTime: currentTime
    });
};

exports.getTokenInfo = (req, res, next) => {
    let tokenStr = fs.readFileSync(path.join(__dirname, '../../data', 'tokens.json'))
    let tokens = JSON.parse(tokenStr) 
    let token = tokens[req.query.token]

    let displayToken = [], i = 0
    for (let x in token) {
        displayToken[i] = x + ": " + token[x]
        i++
    }

    res.render('user/token-info', {
        pageTitle: 'Token-Info',
        path: '/token-info',
        tokenId: req.query.token,
        token: displayToken
    });
}

exports.getFilter = (req, res, next) => {
    let filter = req.query.filter
    
}