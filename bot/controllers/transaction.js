const creds = require("../creds.json");
const client = require('./client');
const algos = require('./algos');
const helper = require('./helper');
const bot = require('../app');
const fs = require('fs');
const path = require('path');

// let accInfo = { funds: creds.funds, initialFunds: creds.funds, tokenLimit: creds.tokenLimit, numOfTokens: 0 }
const propFundsDivided = creds.propFundsDivided

//'pos' param not required for 'buy' transactionTypes
const afterTransaction = (tokenId, tokenInfo, res, transactionType, orderType, accInfo, pos = 0) => {
    if (transactionType == 'buy') {
        console.log("Order Info: ")
        console.log(res)

        if (orderType == 'limit') {
            tokenInfo.orderPlaced = true
            tokenInfo.transactionTimestamp = Date.now() / 60000
        }
        else {
            tokenInfo.purchased = true
        }

        tokenInfo.orderId = res.id

        tokenInfo.purchasedPrice = tokenInfo.curr
        tokenInfo.purchasedHigh = tokenInfo.curr
        tokenInfo.purchasedHighTimestamp = algos.cbTimestamp()
        tokenInfo.amountInvested = parseFloat(res.size) * tokenInfo.curr

        accInfo.amountInvested += tokenInfo.amountInvested
        accInfo.soldAmountInvested += tokenInfo.amountInvested

        tokenInfo.purchasedHighSellTf = tokenInfo.curr
        tokenInfo.purchasedHighSellTfTimestamp = algos.cbTimestamp()
        tokenInfo.endTimestampSellTf = tokenInfo.purchasedTimestamp
        tokenInfo.startTimestampSellTf = tokenInfo.purchasedTimestamp
        tokenInfo.wstHigh = tokenInfo.purchasedPrice
        tokenInfo.wstTimestamp = algos.cbTimestamp()
        accInfo.funds = accInfo.funds - (accInfo.initialFunds * propFundsDivided)
        accInfo.numOfTokens += 1

        if (orderType == 'market') {
            client.getOrder(tokenInfo.orderId)
                .then(result => {
                    tokenInfo.quantified = true
                    console.log("GET ORDERS: ")
                    console.log(result)
                    tokenInfo.quantity = result.filled_size

                    if (parseFloat(tokenInfo.quantity) == 0) {
                        tokenInfo.quantified = false
                    }

                    console.log("Purchased " + tokenId + "; Quantity: " + tokenInfo.quantity)
                })
                .catch(e => {
                    console.log("Get orders: " + e)
                    tokenInfo.quantified = false

                })
        }
        else {
            tokenInfo.quantified = true
        }

        fs.writeFile(path.join(__dirname, '../../data', 'accInfo.json'), JSON.stringify(accInfo),
            (err) => { })

        console.log("Token Info: ")
        console.log(tokenInfo)

    }
    else if (transactionType == 'sell') {
        console.log("SELL: ")
        console.log(res)

        if (orderType == 'limit') {
            tokenInfo.orderPlaced = true
            tokenInfo.transactionTimestamp = Date.now() / 60000
            tokenInfo.orderId = res.id
            tokenInfo.gl = (((tokenInfo.curr / tokenInfo.purchasedPrice) - 1) * 100).toFixed(2)
        }
        else if (orderType == 'market') {
            if (tokenInfo.switchBackToLimit) {
                tokenInfo.isLimitOnly = true
                tokenInfo.switchBackToLimit = false
            }

            accInfo.totalReturn += parseFloat(parseFloat(res.executed_value).toFixed(4))
            accInfo.amountInvested -= tokenInfo.amountInvested
            accInfo.netGainLoss = (accInfo.totalReturn) / (accInfo.soldAmountInvested - accInfo.amountInvested)

            if (tokenInfo.purchased && tokenInfo.purchasedHigh * ((creds.sellPercent / 100) + 1) < tokenInfo.low * ((creds.buyPercent / 100) + 1)) {
                tokenInfo.buyPercent += creds.incrementBuyPercent
                tokenInfo.createBuyStopPercent += creds.incrementBuyPercent
                tokenInfo.buyMaxPercent += creds.incrementBuyPercent
                tokenInfo.fastRunnerPercent += creds.incrementBuyPercent
            }

            tokenInfo.purchased = false
            tokenInfo.isBeingSold = false
            tokenInfo.amountInvested = 0
            tokenInfo.purchasedTimestamp = 0
            tokenInfo.quantity = 0
            tokenInfo.fastRunnerHigh = 0
            tokenInfo.orderId = ''
            tokenInfo.fastRunnerGrowthRate = 0
            tokenInfo.buyWindowGrowthRate = 0
            tokenInfo.quantified = false
            tokenInfo.isPrevPurchase = false

            tokenInfo.isSellable = true
            tokenInfo.goneAboveConfirmPerc = false
            accInfo.funds += res.size * tokenInfo.curr
            accInfo.tokensSold += 1
            accInfo.numOfTokens -= 1
            tokenInfo.endTimestampSellTf = 0
            tokenInfo.startTimestampSellTf = 0

            fs.writeFile(path.join(__dirname, '../../data', 'accInfo.json'), JSON.stringify(accInfo),
                (err) => { })

            console.log("Sell Token Info After Purchase: ")
            console.log(tokenInfo)
            if (tokenInfo.gl != null && tokenInfo.gl != 0) {
                console.log("Sold " + tokenId + " @ Gain/Loss of: " + tokenInfo.gl + '%')
            }
        }
    }
}

const makePurchase = async (tokenId, tokenInfo, type, accInfo) => {
    tokenInfo.amountInvested = accInfo.costPerToken
    try {
        if (type == "market") {
            let res = await client.buy({ type: "market", product_id: tokenId, funds: tokenInfo.amountInvested.toFixed(2) })
            afterTransaction(tokenId, tokenInfo, res, 'buy', type, accInfo)
        }
        else if (type == "limit") {
            let size = (tokenInfo.amountInvested / tokenInfo.curr).toFixed(tokenInfo.sizeDecis)
            let targetPrice = (tokenInfo.low * ((tokenInfo.buyPercent / 100) + 1)).toFixed(tokenInfo.numOfDecis)
            let targetLim = (tokenInfo.low * ((tokenInfo.buyMaxPercent / 100) + 1)).toFixed(tokenInfo.numOfDecis)

            tokenInfo.quantity = size

            let res = await client.buy({
                type: "limit", product_id: tokenId, size: size, stop: "entry",
                stop_price: targetPrice, price: targetLim, time_in_force: 'GTT', cancel_after: 'min'
            })
            afterTransaction(tokenId, tokenInfo, res, 'buy', type, accInfo)
        }
    }
    catch (e) {
        console.log("Buy: " + tokenId + ' ' + e)
        if (e.response.data.message.includes('size is too accurate')) {
            tokenInfo.sizeDecis -= 1
        }
        if (e.response.data.message == 'Limit only mode') {
            tokenInfo.canMarket = false
            tokenInfo.isLimitOnly = true
        }
        if (e.response.data.message.includes('price is too accurate')) {
            tokenInfo.numOfDecis -= 1
        }
    }
}

const makeSell = async (tokenId, tokenInfo, type, accInfo, i, tp = 0, tl = 0) => {
    try {
        tokenInfo.quantity = (parseFloat(tokenInfo.quantity)).toFixed(tokenInfo.sizeDecis)
        tokenInfo.isBeingSold = true
        if (type == "market") {
            console.log("Sell Token Info BEFORE Purchase: ")
            console.log(tokenInfo)

            let res = await client.sell({ type: "market", product_id: tokenId, size: tokenInfo.quantity })
            afterTransaction(tokenId, tokenInfo, res, 'sell', type, accInfo, i)
        }
        else if (type == "limit") {
            console.log("Sell Token Info BEFORE Purchase: ")
            console.log(tokenInfo)

            let targetPrice, targetLim
            if (tp == 0) {
                targetPrice = (tokenInfo.purchasedHigh * ((creds.sellPercent / 100) + 1)).toFixed(tokenInfo.numOfDecis)
            }
            else {
                targetPrice = tp.toFixed(tokenInfo.numOfDecis)
            }
            if (tl == 0) {
                targetLim = (tokenInfo.purchasedHigh * ((creds.sellMaxPercent / 100) + 1)).toFixed(tokenInfo.numOfDecis)
            }
            else {
                targetLim = tp.toFixed(tokenInfo.numOfDecis)
            }

            let res = await client.sell({
                type: "limit", product_id: tokenId, size: tokenInfo.quantity, stop: "loss",
                stop_price: targetPrice, price: targetLim, time_in_force: 'GTT', cancel_after: 'min'
            })
            afterTransaction(tokenId, tokenInfo, res, 'sell', type, accInfo, i)
        }
    }
    catch (e) {
        if (e.response.data.message == 'Limit only mode') {
            tokenInfo.canMarket = false
            tokenInfo.isLimitOnly = true
        }
        if (e.message.includes('size is too small')) {
            tokenInfo.quantity = (creds.funds * creds.propFundsDivided) / tokenInfo.curr
        }
        if (e.response.data.message.includes('price is too accurate')) {
            tokenInfo.numOfDecis -= 1
        }
        if (type == 'limit') {
            tokenInfo.isLimitOnly = false
        }
        tokenInfo.isBeingSold = false
        console.log("Sell: " + e)
    }
}

const purchase = async (tokenId, tokenInfo, accInfo) => {
    if (!tokenInfo.purchased && !tokenInfo.orderPlaced && tokenInfo.isPurchaseable
        && (tokenInfo.growthRate * 100) <= tokenInfo.buyMaxPercent) {
        if (!tokenInfo.isLimitOnly && (((tokenInfo.growthRate * 100) >= tokenInfo.buyPercent) ||
            ((tokenInfo.buyWindowGrowthRate * 100) >= creds.buyWindowPercent))) {
            await makePurchase(tokenId, tokenInfo, "market", accInfo)
        }

        else if (tokenInfo.isLimitOnly && (tokenInfo.growthRate * 100) >= tokenInfo.createBuyStopPercent) {
            await makePurchase(tokenId, tokenInfo, "limit", accInfo)
        }
    }

}

const sell = async (tokenId, tokenInfo, accInfo, i) => {
    if (tokenInfo.purchased && !tokenInfo.isBeingSold) {
        if ((algos.cbTimestamp() - tokenInfo.wstTimestamp) / 60 > tokenInfo.wstTimeframe && tokenInfo.isSellable
            && !tokenInfo.goneAboveConfirmPerc) {
            if (!tokenInfo.isPurchaseable) {
                if (tokenInfo.canMarket) {
                    await makeSell(tokenId, tokenInfo, 'market', accInfo, i)
                }
                else {
                    await makeSell(tokenId, tokenInfo, 'limit', accInfo, i, tokenInfo.curr,
                        tokenInfo.curr * (((creds.sellMaxPercent - creds.sellPercent) / 100) + 1))
                }
            }
            else {
                let targetPrice = (tokenInfo.low * ((tokenInfo.buyPercent / 100) + 1)).toFixed(tokenInfo.numOfDecis)
                let targetLim = (tokenInfo.low * ((tokenInfo.buyMaxPercent / 100) + 1)).toFixed(tokenInfo.numOfDecis)
                let lowestAsk = tokenInfo.curr + tokenInfo.spread

                if (lowestAsk > targetLim || lowestAsk < targetPrice) {
                    if (tokenInfo.canMarket) {
                        await makeSell(tokenId, tokenInfo, 'market', accInfo, i)
                    }
                    else {
                        await makeSell(tokenId, tokenInfo, 'limit', accInfo, i, tokenInfo.curr,
                            tokenInfo.curr * (((creds.sellMaxPercent - creds.sellPercent) / 100) + 1))
                    }
                }
            }
        }

        if (!tokenInfo.isLimitOnly && tokenInfo.canMarket && (((tokenInfo.decayRate * 100) <= creds.sellPercent)
            || ((tokenInfo.decayRateSelltf * 100) <= creds.sellPercent)
        )) {
            await makeSell(tokenId, tokenInfo, 'market', accInfo, i)
        }

        if (tokenInfo.isLimitOnly && ((tokenInfo.decayRate * 100) <= creds.createSellStopPercent)
            || (tokenInfo.decayRateSellTf * 100) <= creds.createSellStopPercent
        ) {
            await makeSell(tokenId, tokenInfo, 'limit', accInfo, i)
        }
    }
}

module.exports = {
    sell: sell, purchase: purchase, afterTransaction: afterTransaction
}
