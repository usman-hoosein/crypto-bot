const creds = require("../creds.json");
const bot = require('../app')
const algos = require('./algos')

let tokensMain = {}
let fastRunnerIds = []

const sellTimeframeAdjust = async (tokenId, tokenInfo) => {
    try {
        var currentDate = new Date()
        tokenInfo.endTimestampPhraseSellTf = timestamp(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate(), currentDate.getHours(),
            currentDate.getMinutes(), currentDate.getSeconds())
        tokenInfo.endTimestampSellTf = Math.floor(Date.now() / 60000)

        if ((tokenInfo.endTimestampSellTf - tokenInfo.startTimestampSellTf) > creds.sellTimeframe) {
            tokenInfo.startTimestampPhraseSellTf = timestamp(currentdate.getFullYear(), currentdate.getMonth() + 1,
                currentdate.getDate(), currentdate.getHours(), currentdate.getMinutes() - creds.sellTimeframe, 0)
            tokenInfo.startTimestampSellTf = Math.floor(Date.now() / 60000) - creds.sellTimeframe
        }

        url = "https://api.exchange.coinbase.com/products/" + tokenId + "/candles?granularity=60&start="
            + tokenInfo.startTimestampPhraseSellTf + "&end=" + tokenInfo.endTimestampPhraseSellTf

        let { body } = await got(url)
        res = JSON.parse(body)
        if (res.length - 1 < 0) { return; }
        currInfo = res[res.length - 1]
        if (currInfo == null) { return; }
        tokenInfo.purchasedHighSellTf = currInfo[2]

        for (let x = res.length - 1; x >= 0; x--) {
            currInfo = res[x]
            if (tokenInfo.purchasedHighSellTf < currInfo[2]) {
                tokenInfo.purchasedHighSellTf = currInfo[2]
            }
        }
    }
    catch (e) {
        console.log("Sell Time Adjust" + e)
    }
}


let asyncCandleUpdate = async () => {
    let startAsyncUpdate = Date.now()
    if (((Date.now() - startAsyncUpdate) / 1000) >= creds.candleBufferTime) {
        for (let i = 0; i < fastRunnerIds.length; i++) {
            var currentdate = new Date();
            cd = currentdate
            tokensMain[fastRunnerIds[i]].endTimestampPhrase = timestamp(currentdate.getFullYear(), currentdate.getMonth() + 1, currentdate.getDate(), currentdate.getHours(),
                currentdate.getMinutes(), currentdate.getSeconds())
            tokensMain[fastRunnerIds[i]].endTimestamp = Math.floor(Date.now() / 60000)

            if ((tokensMain[fastRunnerIds[i]].endTimestamp - tokensMain[fastRunnerIds[i]].startTimestamp) > creds.buyTimeframe) {
                tokensMain[fastRunnerIds[i]].startTimestampPhrase = timestamp(currentdate.getFullYear(), currentdate.getMonth() + 1,
                    currentdate.getDate(), currentdate.getHours(), currentdate.getMinutes() - creds.buyTimeframe, 0)
                tokensMain[fastRunnerIds[i]].startTimestamp += 1
            }

            let url = "https://api.exchange.coinbase.com/products/" + fastRunnerIds[i] + "/candles?granularity=60&start="
                + tokensMain[fastRunnerIds[i]].startTimestampPhrase + "&end=" + tokensMain[fastRunnerIds[i]].endTimestampPhrase

            let { body } = await got(url)
            res = JSON.parse(body)
            if (res.length - 1 < 0) { continue; }

            tokensMain[fastRunnerIds[i]].fastRunnerHigh = res[0][2]

            let currInfo = res[res.length - 1]
            if (currInfo == null) { continue; }
            else {
                tokensMain[fastRunnerIds[i]].buyTfHigh = currInfo[2]
            }


            for (let j = res.length - 1; j >= 0; j--) {
                currInfo = res[j]
                if (currInfo != null) {
                    if (j == res.length - 1) {
                        tokensMain[fastRunnerIds[i]].buyWindowCbTimestamp = currInfo[0]
                        tokensMain[fastRunnerIds[i]].buyWindowLow = currInfo[1]
                    }
                    if (tokensMain[fastRunnerIds[i]].low > currInfo[1]) { tokensMain[fastRunnerIds[i]].low = currInfo[1] }
                    if (tokensMain[fastRunnerIds[i]].buyTfHigh < currInfo[2]) { tokensMain[fastRunnerIds[i]].buyTfHigh = currInfo[2] }
                    tokensMain[fastRunnerIds[i]].currCbTimestamp = currInfo[0]

                    if (tokensMain[fastRunnerIds[i]].purchased &&
                        currInfo[2] > tokensMain[fastRunnerIds[i]].purchasedHigh &&
                        tokensMain[fastRunnerIds[i]].purchaseTimestamp < currInfo[0]) {
                        tokensMain[fastRunnerIds[i]].purchasedHigh = currInfo[2]
                    }
                    if (currInfo[0] >= tokensMain[fastRunnerIds[i]].fastRunnerStartCbTimestamp &&
                        currInfo[2] > tokensMain[fastRunnerIds[i]].fastRunnerHigh) {
                        tokensMain[fastRunnerIds[i]].fastRunnerHigh = currInfo[2]
                    }
                }
            }
        }
        startAsyncUpdate = Date.now()
    }
}