const request = require('./request');
const creds = require("../creds.json");
const algos = require('./algos')
const qs = require('qs');

var cbTokenIds = []
var krTokenIds = []
let allTokenIds = { ids: [], exchanges: [], quantityDecis: [] }

let initializeIds = async () => {
    try {
        //Initializing Kraken IDs
        let res = await request.get('AssetPairs', 'kraken')
        res = res.result
        for (let id in res) {
            if (id.endsWith('USD') && !creds.skipTokens.includes(res[id].base)) {
                krTokenIds.push(id)
                allTokenIds.ids.push(id)
                allTokenIds.exchanges.push('kraken')
                allTokenIds.quantityDecis.push(res[id].pair_decimals)
            }
        }

        //Initializing Coinbase IDs
        res = await request.get('products', 'coinbase')
        for (let i = 0; i < res.length; i++) {
            if (res[i].id.endsWith("USD") || res[i].id.endsWith("USDT") || res[i].id.endsWith("USDC")) {
                let altered = false, tName = res[i].base_currency, qCurr = res[i].quote_currency
                for (let j = 0; j < cbTokenIds.length; j++) {
                    if (cbTokenIds[j].startsWith(tName) && qCurr == "USD") {
                        cbTokenIds[j] = res[i].id
                        altered = true
                        break
                    }
                }
                if (!altered && qCurr != "USDT" && qCurr != "USDC") {
                    if (!creds.skipTokens.includes(tName)) {
                        cbTokenIds.push(res[i].id)

                        let inAll = false
                        for (let k = 0; k < allTokenIds.ids.length; k++) {
                            if (allTokenIds[k].startsWith(tName)) {
                                inAll = true
                                break
                            }
                        }
                        if (!inAll) {
                            allTokenIds.ids.push(res[i].id)
                            allTokenIds.exchanges.push('coinbase')
                            
                            let tempSizeDecis = res[i].base_increment
                            if (parseFloat(tempSizeDecis) == 1e-8) {
                                tempSizeDecis = 8
                            }
                            else {
                                tempSizeDecis = algos.countDecimals(parseFloat(tempSizeDecis))
                            }            
                            allTokenIds.quantityDecis.push(tempSizeDecis)
                        }
                    }
                }
            }
        }

        return allTokenIds
    }
    catch (e) {
        throw e
    }
}

//bodyParams are the queryParams in JSON form
const buy = async (bodyParams) => {
    let bodyRequest = bodyParams || {}
    Object.assign(bodyRequest, {
        side: 'buy'
    })

    try {
        return await request.post('orders', 'coinbase', bodyRequest)
    }
    catch (e) {
        throw e
    }
}

const sell = async (bodyParams) => {
    let bodyRequest = bodyParams || {}
    Object.assign(bodyRequest, {
        side: 'sell'
    })

    try {
        return await request.post('orders', 'coinbase', bodyRequest)
    }
    catch (e) {
        throw e
    }
}

const getOrder = async (orderId) => {
    return await request.get('orders/' + orderId, 'coinbase', doesRequireAuth = true)
}

const getAllOrders = async (startDate) => {
    let sd = ''
    for (let i = 0; i < startDate.length; i++) {
        if (i == 10) {
            sd += 'T'
        }
        else {
            sd += startDate[i]
        }
    }
    sd += 'Z'

    try {
        let res = await request.get('orders?limit=1000&status=done&sorting=desc&sortedBy=created_at&start_date=' + sd, 'coinbase', true)
        return res
    }
    catch (e) {
        throw e
    }
}

const getFills = async (tokenId) => {
    try {
        let res = await request.get('fills?product_id=' + tokenId, 'coinbase', true)
        return res
    }
    catch (e) {
        throw e
    }
}

const getCandles = async (tokenId, granularity, startQSTimestamp = '', endQSTimestamp = '') => {
    let qParams = {
        granularity: granularity,
        start: startQSTimestamp,
        end: endQSTimestamp
    }
    let pEnd = "products/" + tokenId + "/candles?" + qs.stringify(qParams)
    return await request.get(pEnd, 'coinbase')
}

const getTokenIds = async () => {
    return await request.get('products', 'coinbase')
}

const deleteOrder = async (orderId) => {
    let uriEnd = 'orders/' + orderId
    return await request.post(uriEnd, 'coinbase', null, 'DELETE')
}

module.exports = {
    buy: buy, sell: sell, getOrder: getOrder, getCandles: getCandles, getTokenIds: getTokenIds,
    deleteOrder: deleteOrder, getAllOrders: getAllOrders, getFills: getFills, initializeIds: initializeIds
}