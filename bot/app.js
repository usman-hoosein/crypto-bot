const creds = require("./creds.json");
const client = require('./controllers/client');
const transaction = require('./controllers/transaction');
const algos = require('./controllers/algos');
const update = require('./controllers/update')

const fs = require('fs');
const path = require('path');

// Coinbase variables
let allTokenIds = []
let tokensMain = {}
let fastRunnerIds = []

let accInfo = {
    funds: creds.funds, initialFunds: creds.funds, tokenLimit: creds.tokenLimit, numOfTokens: 0,
    costPerToken: creds.costPerToken, amountInvested: 0, totalReturn: 0, netGainLoss: 0, soldAmountInvested: 0
}

const purchaseable = (tokenId, tokenInfo) => {
    if (tokenInfo.isPurchaseable) {
        if (tokenInfo.purchased && tokenInfo.growthRate * 100 > tokenInfo.buyPercent) {
            tokenInfo.isPurchaseable = false
            tokenInfo.needsRelativeMin = true
        }
        else if (!tokenInfo.purchased && tokenInfo.growthRate * 100 > tokenInfo.buyMaxPercent) {
            tokenInfo.isPurchaseable = false
            tokenInfo.needsRelativeMin = true
        }
    }

    else if (!tokenInfo.isPurchaseable) {
        if (tokenInfo.growthRate * 100 <= (tokenInfo.buyPercent * ((creds.recoverPercent / 100) + 1))) {
            tokenInfo.isPurchaseable = true
            tokenInfo.needsRelativeMin = false
            goToFastRunner(tokenId, tokenInfo)
        }
        else if (tokenInfo.relativeGrowthRate * 100 >= tokenInfo.fastRunnerPercent) {
            let currentdate = new Date()
            let currSecs = Math.floor(Date.now() / 1000)

            tokenInfo.isPurchaseable = true
            tokenInfo.needsRelativeMin = false
            tokenInfo.low = tokenInfo.relativeMin

            if (tokenInfo.purchasedHighTimestamp != 0) {
                tokenInfo.startTimestamp = tokenInfo.purchasedHighTimestamp
            }
            else {
                tokenInfo.startTimestamp = tokenInfo.relativeMinTS
            }

            let offset = (currSecs - tokenInfo.startTimestamp) / 60
            tokenInfo.startTimestampPhrase = algos.timestamp(currentdate.getFullYear(), currentdate.getMonth() + 1,
                currentdate.getDate(), currentdate.getHours(), currentdate.getMinutes() - offset, 0)

            goToFastRunner(tokenId, tokenInfo)
        }
    }
}


const goToFastRunner = async (tokenId, tokenInfo) => {
    if (!tokenInfo.isFastRunner) {
        tokenInfo.fastRunnerHigh = tokenInfo.curr
        tokenInfo.fastRunnerStartCbTimestamp = algos.cbTimestamp()
        tokenInfo.isFastRunner = true

        fastRunnerIds.push(tokenId)
        console.log("Fast Runner IDs size: " + fastRunnerIds.length + "; ID: " + tokenId + "; Fast-runner-growth-percent: "
            + (tokenInfo.fastRunnerGrowthRate * 100).toFixed(2) + "; is purchased: " + tokenInfo.purchased)

        if (fastRunnerIds.length == 1) {
            fastRunners()
        }
    }
}

const deleteOrder = (tokenId, tokenInfo) => {
    accInfo.funds += tokenInfo.amountInvested
    accInfo.numOfTokens -= 1

    tokenInfo.orderPlaced = false
    tokenInfo.quantified = false
    tokenInfo.quantity = 0

    tokenInfo.transactionTimestamp = 0

    tokenInfo.endTimestampSellTf = 0
    tokenInfo.startTimestampSellTf = 0

    tokenInfo.amountInvested = 0

    console.log('Removed Order for: ' + tokenId)
}


let getAllTokenIds = async () => {
    try {
        let res = await client.getTokenIds()

        let startTimestampV = algos.timestamp(creds.year, creds.month,
            creds.day, creds.hour, creds.minute, 0)
        let endTimestampV = algos.timestamp(creds.year, creds.month,
            creds.day, creds.hour, creds.minute, 0)

        let temp = {
            startTimestampPhrase: startTimestampV, //Timestamp for buyTf
            endTimestampPhrase: endTimestampV, //Timestamp for buyTf
            startTimestamp: algos.tweakedCbTimestamp(startTimestampV),
            endTimestamp: algos.tweakedCbTimestamp(endTimestampV),

            buyPercent: creds.buyPercent,
            createBuyStopPercent: creds.createBuyStopPercent,
            buyMaxPercent: creds.buyMaxPercent
        }

        for (let i = 0; i < res.length; i++) {
            if (res[i].id.endsWith("USD") || res[i].id.endsWith("USDT") || res[i].id.endsWith("USDC")) {
                let altered = false, tName = res[i].base_currency, qCurr = res[i].quote_currency
                for (let j = 0; j < allTokenIds.length; j++) {
                    if (allTokenIds[j].split('-')[0] == tName && qCurr == "USD") {
                        allTokenIds[j] = res[i].id
                        altered = true
                        break
                    }
                }
                if (!altered && qCurr != "USDT" && qCurr != "USDC") {
                    if (!creds.skipTokens.includes(res[i].id)) {
                        allTokenIds.push(res[i].id)
                        tokensMain[res[i].id] = {}

                        update.initializeToken(tokensMain[res[i].id])
                        Object.assign(tokensMain[res[i].id], temp)

                        tokensMain[res[i].id].sizeDecis = algos.countDecimals(parseFloat(res[i].base_increment))
                        tokensMain[res[i].id].numOfDecis = algos.countDecimals(parseFloat(res[i].quote_increment))
                    }
                }
            }
        }
        console.log("Number of tokens: " + allTokenIds.length)
    }
    catch (e) { console.log(e.message) }
}

let getPreviousFills = async () => {
    let orders = {}, inWallet = [], buyRate = {}
    let res = await client.getAllOrders(algos.timestamp(creds.prevOrdersYear, creds.prevOrdersMonth,
        creds.prevOrdersDay, creds.prevOrdersHour, creds.prevOrdersMinute, 0))

    for (let i = res.length - 1; i >= 0; i--) {
        let currOrder = res[i]
        if (currOrder.side == 'buy') {
            orders[currOrder.product_id] = 1
            buyRate[currOrder.product_id] = parseFloat(currOrder.executed_value)
            accInfo.soldAmountInvested += parseFloat(currOrder.executed_value)
        }
        else {
            if (Object.keys(orders).includes(currOrder.product_id) && orders[currOrder.product_id] == 1) {
                accInfo.totalReturn += parseFloat(currOrder.executed_value)
            }
            if (Object.keys(buyRate).includes(currOrder.product_id)) {
                if (parseFloat(currOrder.executed_value) < buyRate[currOrder.product_id]) {
                    tokensMain[currOrder.product_id].buyPercent += creds.incrementBuyPercent
                    tokensMain[currOrder.product_id].createBuyStopPercent += creds.incrementBuyPercent
                    tokensMain[currOrder.product_id].buyMaxPercent += creds.incrementBuyPercent
                    tokensMain[currOrder.product_id].fastRunnerPercent += creds.incrementBuyPercent
                }
            }
            orders[currOrder.product_id] = 0
        }
    }

    for (let key in orders) {
        if (orders[key] == 1) {
            inWallet.push(key)
        }
    }

    for (let i = 0; i < inWallet.length; i++) {
        let res = await client.getFills(inWallet[i])
        let result = res
        res = res[0]
        let tokenInfo = tokensMain[res.product_id]

        tokenInfo["purchased"] = true
        tokenInfo.orderId = res.id

        tokenInfo.purchasedPrice = parseFloat(parseFloat(res.price).toFixed(tokenInfo.numOfDecis))
        tokenInfo.purchasedHigh = tokenInfo.purchasedPrice
        tokenInfo.purchasedHighTimestamp = algos.cbTimestamp(res.created_at)
        tokenInfo.isPrevPurchase = true

        tokenInfo.quantity = 0
        tokenInfo.amountInvested = 0
        for (let k = 0; k < result.length; k++) {
            if (result[k].side == 'buy') {
                tokenInfo.quantity += parseFloat(parseFloat(result[k].size).toFixed(tokenInfo.sizeDecis))
                tokenInfo.amountInvested += parseFloat(parseFloat(result[k].usd_volume).toFixed(4))
            }
            else {
                break
            }
        }

        tokenInfo.amountInvested = parseFloat((tokenInfo.amountInvested).toFixed(2))
        accInfo.amountInvested += tokenInfo.amountInvested

        tokenInfo.purchasedTimestamp = algos.cbTimestamp(res.created_at)
        tokenInfo.endTimestampSellTf = tokenInfo.purchasedTimestamp
        tokenInfo.startTimestampSellTf = tokenInfo.purchasedTimestamp

        let startDate = ['', '', '', '', '']
        let startTimestamp = res.created_at
        for (let j = 0; j < startTimestamp.length; j++) {
            if (j <= 3) {
                startDate[0] += startTimestamp[j]
            }
            else if (j >= 5 && j <= 6) {
                startDate[1] += startTimestamp[j]
            }
            else if (j >= 8 && j <= 9) {
                startDate[2] += startTimestamp[j]
            }
            else if (j >= 11 && j <= 12) {
                startDate[3] += startTimestamp[j]
            }
            else if (j >= 14 && j <= 15) {
                startDate[4] += startTimestamp[j]
            }
        }

        for (let j = 0; j < startDate.length; j++) {
            parseInt(startDate[j])
        }

        let r = 0
        tokenInfo.startTimestamp = algos.cbTimestamp(res.created_at)
        tokenInfo.startTimestampPhrase = algos.timestamp(startDate[0], startDate[1], startDate[2], startDate[3] - 6,
            parseInt(startDate[4]), 0)
        while (tokenInfo.endTimestamp > tokenInfo.startTimestamp) {
            let hourOffset = Math.floor((parseInt(startDate[4]) + (299 * (r + 1))) / 60)
            let minOffset = (parseInt(startDate[4]) + (299 * (r + 1))) % 60

            tokenInfo.endTimestampPhrase = algos.timestamp(startDate[0], startDate[1], startDate[2], startDate[3] - 6 + hourOffset,
                minOffset, 0)

            res = await client.getCandles(inWallet[i], 60, tokenInfo.startTimestampPhrase, tokenInfo.endTimestampPhrase)

            if (res != null && res.length != 0) {
                let currInfo
                for (let j = res.length - 1; j >= 0; j--) {
                    currInfo = res[j]
                    if (currInfo[2] > tokenInfo.purchasedHigh &&
                        currInfo[0] >= tokenInfo.purchasedTimestamp) {
                        tokenInfo.purchasedHigh = currInfo[2]
                        tokenInfo.purchasedHighTimestamp = currInfo[0]
                    }
                }

                // update.purchasedHighs(res, tokenInfo)
            }
            tokenInfo.startTimestampPhrase = tokenInfo.endTimestampPhrase
            r += 1
            tokenInfo.startTimestamp += (299 * 60)
        }
        tokensMain[inWallet[i]].startTimestamp = 0

        goToFastRunner(inWallet[i], tokenInfo)
    }
    if (accInfo.soldAmountInvested - accInfo.amountInvested != 0) {
        accInfo.netGainLoss = accInfo.totalReturn / (accInfo.soldAmountInvested - accInfo.amountInvested)
    }
    else {
        accInfo.netGainLoss = 0
    }
    fs.writeFile(path.join(__dirname, '../', 'data', 'accInfo.json'), JSON.stringify(accInfo), (e) => { })

    accInfo.numOfTokens += 1
    tokenInfo.purchasedHighSellTf = tokenInfo.purchasedHigh
    tokenInfo.purchasedHighSellTfTimestamp = algos.cbTimestamp(res.created_at)
    if ((algos.cbTimestamp() - tokenInfo.purchasedHighTimestamp) / 60 <= creds.wstTimeframe
        || (algos.cbTimestamp() - tokenInfo.purchasedHighSellTfTimestamp) / 60 <= creds.wstTimeframe) {
        tokenInfo.isSellable = true
    }
    else {
        tokenInfo.isSellable = false
    }
    tokenInfo.wstHigh = tokenInfo.purchasedPrice
    tokenInfo.wstTimestamp = algos.cbTimestamp(res.created_at)
    accInfo.funds -= tokenInfo.amountInvested
}

let begin = async () => {
    let end, waveStart
    while (true) {
        try {
            waveStart = Date.now()
            for (let i = 0; i < allTokenIds.length; i++) {
                var currentdate = new Date();
                cd = currentdate
                if (creds.buyTimeframe >= 0 && creds.sellTimeframe >= 0) {
                    tokensMain[allTokenIds[i]].endTimestampPhrase = algos.timestamp(currentdate.getFullYear(), currentdate.getMonth() + 1, currentdate.getDate(), currentdate.getHours(),
                        currentdate.getMinutes(), currentdate.getSeconds())
                    tokensMain[allTokenIds[i]].endTimestamp = algos.cbTimestamp()

                    if ((tokensMain[allTokenIds[i]].endTimestamp - tokensMain[allTokenIds[i]].startTimestamp) / 60 > creds.buyTimeframe) {
                        let hourOffset = Math.floor(creds.buyTimeframe / 60)
                        let minOffset = creds.buyTimeframe % 60
                        tokensMain[allTokenIds[i]].startTimestampPhrase = algos.timestamp(currentdate.getFullYear(), currentdate.getMonth() + 1,
                            currentdate.getDate(), currentdate.getHours() - hourOffset, currentdate.getMinutes() - minOffset, 0)
                        tokensMain[allTokenIds[i]].startTimestamp = algos.cbTimestamp('', 60, creds.buyTimeframe * 60)
                    }
                }
                else {
                    tokensMain[allTokenIds[i]].startTimestampPhrase = ''
                    tokensMain[allTokenIds[i]].endTimestampPhrase = ''
                }

                let res = await client.getCandles(allTokenIds[i], creds.granularity, tokensMain[allTokenIds[i]].startTimestampPhrase,
                    tokensMain[allTokenIds[i]].endTimestampPhrase)
                if (res == null) { continue; }

                update.involvingCandles(res, tokensMain[allTokenIds[i]])

                if (!tokensMain[allTokenIds[i]].isFastRunner) {
                    update.decayRates(tokensMain[allTokenIds[i]])
                    update.growthRates(tokensMain[allTokenIds[i]])
                    purchaseable(allTokenIds[i], tokensMain[allTokenIds[i]])

                    //BUY
                    let isBeingPurchased = false
                    if ((tokensMain[allTokenIds[i]].isPurchaseable
                        && ((tokensMain[allTokenIds[i]].growthRate * 100) >= tokensMain[allTokenIds[i]].createBuyStopPercent)
                        || ((tokensMain[allTokenIds[i]].buyWindowGrowthRate * 100) >= creds.buyWindowPercent))
                        && !tokensMain[allTokenIds[i]].purchased && (tokensMain[allTokenIds[i]].growthRate * 100) <= tokensMain[allTokenIds[i]].buyMaxPercent) {
                        isBeingPurchased = true

                        try {
                            await transaction.purchase(allTokenIds[i], tokensMain[allTokenIds[i]], accInfo)
                            goToFastRunner(allTokenIds[i], tokensMain[allTokenIds[i]])
                        }
                        catch (e) {
                            console.log("Buy: " + e.message)
                            goToFastRunner(allTokenIds[i], tokensMain[allTokenIds[i]])
                        }
                    }

                    if ((!isBeingPurchased) && ((tokensMain[allTokenIds[i]].fastRunnerGrowthRate * 100) > tokensMain[allTokenIds[i]].fastRunnerPercent)
                        && (tokensMain[allTokenIds[i]].growthRate * 100) < tokensMain[allTokenIds[i]].buyPercent) {
                        goToFastRunner(allTokenIds[i], tokensMain[allTokenIds[i]])
                    }

                }
            }
            end = Date.now()
            console.log("Wave complete: " + (end - waveStart) / 1000)

            fs.writeFile(path.join(__dirname, '../data', 'tokens.json'), JSON.stringify(tokensMain), (err) => { })
            fs.writeFile(path.join(__dirname, '../', 'data', 'accInfo.json'), JSON.stringify(accInfo), (e) => { })
        }
        catch (e) {
            console.log("REGULAR: " + e.stack)
        }
    }
}

let fastRunners = async () => {
    while (fastRunnerIds.length > 0) {
        try {
            for (let i = 0; i < fastRunnerIds.length; i++) {
                let start = Date.now()
                while (Date.now() - start < creds.fastRunnerRefreshRate) {
                    continue
                }

                await update.current(fastRunnerIds[i], tokensMain[fastRunnerIds[i]])

                update.decayRates(tokensMain[fastRunnerIds[i]])
                update.growthRates(tokensMain[fastRunnerIds[i]])
                purchaseable(fastRunnerIds[i], tokensMain[fastRunnerIds[i]])

                if (tokensMain[fastRunnerIds[i]].orderPlaced && ((Date.now() / 60000) - tokensMain[fastRunnerIds[i]].transactionTimestamp) > 1) {
                    let res = await client.getOrder(tokensMain[fastRunnerIds[i]].orderId)
                    if (res.status == 'done' || res.status == 'settled') {
                        if (!tokensMain[res.product_id].purchased) {
                            tokensMain[res.product_id].purchased = true

                            if (creds.marketSells) {
                                tokensMain[fastRunnerIds[i]].isLimitOnly = false
                                tokensMain[fastRunnerIds[i]].switchBackToLimit = true
                            }
                        }
                        else {
                            transaction.afterTransaction(res.product_id, tokensMain[res.product_id], res, 'sell', 'market', accInfo)
                            fastRunnerIds.splice(i, 1)
                            continue
                        }

                        console.log("ORDER CONFIRMED: " + res.product_id)
                    }
                    else if (res.status == 'pending' || res.status == 'active') { }
                    else {
                        if (!tokensMain[fastRunnerIds[i]].purchased) {
                            deleteOrder(fastRunnerIds[i], tokensMain[fastRunnerIds[i]])
                        }
                    }
                    tokensMain[fastRunnerIds[i]].orderPlaced = false
                    tokensMain[fastRunnerIds[i]].isBeingSold = false
                }

                //Checking if the token needs to be removed from fastRunners
                if ((((tokensMain[fastRunnerIds[i]].fastRunnerStartDecayRate * 100) <= creds.fastRunnerCancelPercent)
                    && (!tokensMain[fastRunnerIds[i]].purchased) && (!tokensMain[fastRunnerIds[i]].orderPlaced))
                    || tokensMain[fastRunnerIds[i]].isBeingManipulated) {
                    tokensMain[fastRunnerIds[i]].isFastRunner = false
                    fastRunnerIds.splice(i, 1)
                    console.log("Fast Runner IDs size: " + fastRunnerIds.length)
                    continue
                }

                await transaction.purchase(fastRunnerIds[i], tokensMain[fastRunnerIds[i]], accInfo)
                await transaction.sell(fastRunnerIds[i], tokensMain[fastRunnerIds[i]], accInfo, i)
            }
        }
        catch (e) {
            console.log("Fast Runner Main: " + e.message)
        }
    }
}

module.exports = {
    getAllTokenIds: getAllTokenIds, getPreviousFills: getPreviousFills, begin: begin, goToFastRunner: goToFastRunner, purchaseable: purchaseable
}
