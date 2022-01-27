const creds = require("../creds.json");
const client = require('./client');
const request = require('./request');
const algos = require('./algos');

exports.decayRates = (tokenInfo) => {
    if (tokenInfo.purchasedHighSellTf != null && tokenInfo.purchasedHighSellTf != 0) {
        tokenInfo.decayRateSellTf = (tokenInfo.curr / tokenInfo.purchasedHighSellTf) - 1
    }
    else {
        tokenInfo.decayRateSellTf = Infinity
    }

    if (tokenInfo.purchasedHigh != null && tokenInfo.purchasedHigh != 0) {
        tokenInfo.decayRate = (tokenInfo.curr / tokenInfo.purchasedHigh) - 1
    }
    else {
        tokenInfo.decayRate = Infinity
    }

    if (tokenInfo.fastRunnerHigh != 0) {
        tokenInfo.fastRunnerStartDecayRate = (tokenInfo.curr / tokenInfo.fastRunnerHigh) - 1
    }
    else { tokenInfo.fastRunnerStartDecayRate = Infinity }
}

exports.purchasedHighs = (res, tokenInfo) => {
    let tempCurrInfo
    for (let k = res.length - 1; k >= 0; k--) {
        tempCurrInfo = res[k]
        tokenInfo.endTimestampSellTf = tempCurrInfo[0]

        if (((tokenInfo.endTimestampSellTf - tokenInfo.startTimestampSellTf) / 60) > creds.sellTimeframe) {
            tokenInfo.startTimestampSellTf = tokenInfo.endTimestampSellTf - (creds.sellTimeframe * 60)
        }

        let isFound = false
        for (let x = res.length - 1; x >= 0; x--) {
            tempCurrInfo = res[x]
            if (tempCurrInfo[0] >= tokenInfo.startTimestampSellTf && !isFound) {
                isFound = true
                tokenInfo.purchasedHighSellTf = tempCurrInfo[2]
                tokenInfo.purchasedHighSellTfTimestamp = tempCurrInfo[0]
            }
            if (isFound && tempCurrInfo[0] >= tokenInfo.startTimestampSellTf &&
                tempCurrInfo[0] <= tokenInfo.endTimestampSellTf &&
                tempCurrInfo[2] > tokenInfo.purchasedHighSellTf) {
                tokenInfo.purchasedHighSellTf = tempCurrInfo[2]
                tokenInfo.purchasedHighSellTfTimestamp = tempCurrInfo[0]
            }
            if (tempCurrInfo[0] > tokenInfo.endTimestampSellTf) {
                break
            }
        }
    }
}

exports.involvingCandles = (res, tokenInfo) => {
    this.candles(res, tokenInfo)
    this.windows(res, tokenInfo)

    // if (tokenInfo.purchased) {
    //     this.purchasedHighs(res, tokenInfo)
    //     this.wst(res, tokenInfo)
    // }
    if (tokenInfo.needsRelativeMin) {
        this.relativeMin(res, tokenInfo)
    }
}

exports.candles = (res, tokenInfo) => {
    let currInfo = res[res.length - 1]
    if (currInfo == null) { return; }

    if (!tokenInfo.low) {
        tokenInfo.low = currInfo[1]
    }
    if (!tokenInfo.buyTfHigh) {
        tokenInfo.buyTfHigh = currInfo[2]
    }

    for (let j = res.length - 1; j >= 0; j--) {
        currInfo = res[j]
        if (currInfo != null) {
            if (tokenInfo.low > currInfo[1]) { tokenInfo.low = currInfo[1] }
            if (tokenInfo.buyTfHigh < currInfo[2]) { tokenInfo.buyTfHigh = currInfo[2] }
            tokenInfo.currCbTimestamp = currInfo[0]

            if (tokenInfo.purchased) {
                if (currInfo[2] > tokenInfo.purchasedHigh
                    && tokenInfo.purchasedTimestamp <= currInfo[0]) {
                    tokenInfo.purchasedHigh = currInfo[2]
                    tokenInfo.purchasedHighTimestamp = currInfo[0]
                }
            }

            if (tokenInfo.isFastRunner &&
                currInfo[0] >= tokenInfo.fastRunnerStartCbTimestamp &&
                currInfo[2] > tokenInfo.fastRunnerHigh) {
                tokenInfo.fastRunnerHigh = currInfo[2]
            }

            if (!tokenInfo.isFastRunner) {
                tokenInfo.curr = currInfo[4]
                tokenInfo.purchasedTimestamp = currInfo[0]
            }
        }
    }
}

//windowType can either be "buy", "fast"
exports.windowUpdate = (tokenInfo, res, windowType) => {
    let windowTime = '', cbTimestamp = '', windowLow = 0
    let newCbTime, tempArrIndice

    if (windowType == "buy") {
        windowTime = creds.buyWindowTime
        cbTimestamp = "buyWindowCbTimestamp"
        windowLow = "buyWindowLow"
    }

    else if (windowType == "fast") {
        windowTime = creds.fastRunnerWindowTime
        cbTimestamp = "fastRunnerTimestamp"
        windowLow = "fastRunnerLow"
    }

    // window
    if (!tokenInfo.purchased && windowTime != 0) {
        let tempArr = []
        tokenInfo[windowLow] = tokenInfo.low
        for (let j = res.length - 1; j >= 0; j--) {
            currInfo = res[j]
            tempArr.push(currInfo)
            if (currInfo != null) {
                if (j == res.length - 1) {
                    tokenInfo[cbTimestamp] = currInfo[0]
                }

                if (((currInfo[0] - tokenInfo[cbTimestamp]) / creds.granularity) <= windowTime) {
                    if ((currInfo[1] < tokenInfo[windowLow])) {
                        tokenInfo[windowLow] = currInfo[1]
                        tokenInfo[cbTimestamp] = currInfo[0]
                    }
                }
                else if ((((currInfo[0] - tokenInfo[cbTimestamp]) / creds.granularity) > windowTime)) {
                    newCbTime = currInfo[0] - (windowTime * creds.granularity)
                    tempArrIndice = tempArr.findIndex((element) => element[0] == newCbTime)

                    if (tempArrIndice == -1) {
                        for (let m = 0; m < tempArr.length; m++) {
                            if (tempArr[m][0] > newCbTime) {
                                tempArrIndice = m
                                break
                            }
                        }
                    }
                    currInfo = tempArr[tempArrIndice]

                    tokenInfo[windowLow] = currInfo[1]
                    tokenInfo[cbTimestamp] = currInfo[0]

                    for (let m = tempArrIndice; m < tempArr.length; m++) {
                        currInfo = tempArr[m]
                        if (currInfo[1] < tokenInfo[windowLow]) {
                            tokenInfo[windowLow] = currInfo[1]
                            tokenInfo[cbTimestamp] = currInfo[0]
                        }
                    }
                }
            }
        }
    }
}

exports.windows = (res, tokenInfo) => {
    if (creds.buyWindowTime != 0 && !tokenInfo.purchased) {
        this.windowUpdate(tokenInfo, res, "buy")
    }
    if (creds.fastRunnerWindowTime != 0 && !tokenInfo.isFastRunner) {
        this.windowUpdate(tokenInfo, res, "fast")
    }
}

exports.initializeToken = (tokenInfo) => {
    let minMax = {
        low: Infinity,
        buyTfHigh: 0, //Highest price for past {*buy-timeframe} minutes
        growthRate: 0, //(curr / low)
        decayRate: Infinity, //(curr / purchasedHigh)
        decayRateSellTf: Infinity,
        pos: 0,

        purchasedPrice: 0,
        purchased: false,
        purchasedHigh: 0, //Highest price since moment of purchase
        isPrevPurchase: false,
        purchasedTimestamp: 0,
        purchasedHighTimestamp: 0,
        isPurchaseable: true,

        isSellable: true,
        isBeingSold: false,

        orderId: '',

        amountInvested: 0,

        buyWindowLow: 0,
        buyWindowCbTimestamp: 0,
        buyWindowGrowthRate: 0,

        fastRunnerLow: 0,
        fastRunnerPercent: creds.fastRunnerPercent,
        fastRunnerGrowthRate: 0,
        fastRunnerTimestamp: 0,
        fastRunnerHigh: 0,
        fastRunnerStartCbTimestamp: 0,
        fastRunnerStartDecayRate: Infinity,
        isFastRunner: false,

        curr: 0,
        prevCurr: 0,
        currCbTimestamp: 0,
        isCurrUpdating: false,
        changeInCurrRate: 0,
        spread: 0,
        isBeingManipulated: false,

        isLimitOnly: creds.isLimitOnly,
        canMarket: true,
        switchBackToLimit: false,

        quantified: false,
        orderPlaced: false,
        transactionTimestamp: 0,

        quantity: 0,
        gl: 0,
        goneAboveConfirmPerc: false,

        relativeMin: Infinity,
        relativeGrowthRate: 0,
        needsRelativeMin: false,
        relativeMinTS: 0,

        // //Window Sell Triggers
        // wstHigh: 0,
        // wstTimestamp: 0,
        // wstRangeRate: (creds.wstRangePercent / 100) + 1,
        // wstTimeframe: creds.wstTimeframe //In Minutes
        // purchasedHighSellTf: 0, //Highest price for past {*sell-timeframe} mins since moment of purchase
        // purchasedHighSellTfTimestamp: 0,
        // startTimestampSellTf: 0,
        // endTimestampSellTf: 0,
    }

    Object.assign(tokenInfo, minMax)
}

exports.manipulate = (tokenId, tokenInfo) => {
    if ((tokenInfo.changeInCurrRate * 100) > creds.manipulateRate &&
        (tokenInfo.growthRate * 100) > tokenInfo.buyMaxPercent) {
        tokenInfo.isBeingManipulated = true
    }

    if (tokenInfo.isBeingManipulated) {
        this.resetToken(tokenId, tokenInfo)
    }
}

exports.quantify = async (tokenId, tokenInfo) => {
    if (tokenInfo.purchased && !tokenInfo.quantified) {
        client.getOrder(tokenInfo.orderId)
            .then(res => {
                tokenInfo.quantified = true
                tokenInfo.quantity = res.filled_size

                if (parseFloat(tokenInfo.quantity) == 0) {
                    tokenInfo.quantified = false
                }
                else {
                    console.log("GET ORDERS: ")
                    console.log(res)
                    console.log("Purchased " + tokenId + "; Quantity: " + tokenInfo.quantity)
                }
            })
            .catch(e => {
                console.log("Get orders (quantify): " + e)
                tokenInfo.quantified = false
            })
    }
}

exports.current = async (tokenId, tokenInfo) => {
    tokenInfo.isCurrUpdating = true
    tokenInfo.prevCurr = tokenInfo.curr
    try {
        let body = await request.get("products/" + tokenId + "/book?level=1", 'coinbase')

        if (typeof body == 'string' && body.includes('Request failed with')) {
            return;
        }

        let res = body

        if (!tokenInfo.purchased) {
            tokenInfo.curr = parseFloat(res.asks[0][0])
        }
        else if (tokenInfo.purchased) {
            tokenInfo.curr = parseFloat(res.bids[0][0])
        }

        if (tokenInfo.purchased && tokenInfo.curr > tokenInfo.purchasedHigh) {
            tokenInfo.purchasedHigh = parseFloat(tokenInfo.curr)
            tokenInfo.purchasedHighTimestamp = algos.cbTimestamp()
        }
        // if (tokenInfo.purchased && tokenInfo.curr > tokenInfo.purchasedHighSellTf) {
        //     tokenInfo.purchasedHighSellTf = parseFloat(tokenInfo.curr)
        //     tokenInfo.purchasedHighSellTfTimestamp = algos.cbTimestamp()
        // }
        if (parseFloat(res.bids[0][0]) < tokenInfo.low) {
            tokenInfo.low = parseFloat(res.bids[0][0])
        }

        tokenInfo.spread = parseFloat(res.asks[0][0]) - parseFloat(res.bids[0][0])

        if (tokenInfo.prevCurr != null) {
            tokenInfo.changeInCurrRate = (tokenInfo.curr / tokenInfo.prevCurr) - 1
        }

        tokenInfo.isCurrUpdating = false
    }
    catch (e) {
        console.log("Update Current: " + e.message)
        tokenInfo.isCurrUpdating = false
    }
}

exports.relativeMin = (res, tokenInfo) => {
    if (tokenInfo.relativeGrowthRate <= 0) {
        let currCandle = res[0]
        tokenInfo.relativeMin = currCandle[1]
        tokenInfo.relativeMinTS = currCandle[0]

        for (let i = 0; i < res.length; i++) {
            currCandle = res[i]
            if (currCandle[1] < tokenInfo.relativeMin) {
                tokenInfo.relativeMin = currCandle[1]
                tokenInfo.relativeMinTS = currCandle[0]
            }
            if (currCandle[1] > tokenInfo.relativeMin) {
                break
            }
        }
    }
}

exports.wst = (res, tokenInfo) => {
    for (let i = res.length - 1; i >= 0; i--) {
        let candle = res[i]
        if (candle[0] < tokenInfo.wstTimestamp) {
            continue
        }
        else if (candle[0] <= tokenInfo.wstTimestamp + (tokenInfo.wstTimeframe * 60)) {
            if (candle[2] >= tokenInfo.wstHigh * tokenInfo.wstRangeRate) {
                tokenInfo.wstHigh = candle[2]
                tokenInfo.wstTimestamp = candle[0]
            }
        }
        else if (candle[0] > tokenInfo.wstTimestamp + (tokenInfo.wstTimeframe * 60)) {
            break
        }
    }
}

exports.growthRates = (tokenInfo) => {
    if (tokenInfo.low != 0 && tokenInfo.low != null) {
        tokenInfo.growthRate = (tokenInfo.curr / tokenInfo.low) - 1
    }
    if (tokenInfo.relativeMin != 0 && tokenInfo.relativeMin != null && tokenInfo.needsRelativeMin) {
        tokenInfo.relativeGrowthRate = (tokenInfo.curr / tokenInfo.relativeMin) - 1
    }
    if (tokenInfo.buyWindowLow != 0 && tokenInfo.buyWindowLow != null && !tokenInfo.purchased && creds.buyWindowTime != 0) {
        tokenInfo.buyWindowGrowthRate = (tokenInfo.curr / tokenInfo.buyWindowLow) - 1
    }
    if (tokenInfo.fastRunnerLow != 0 && tokenInfo.fastRunnerLow != null && !tokenInfo.purchased && tokenInfo.fastRunnerWindowTime != 0) {
        tokenInfo.fastRunnerGrowthRate = (tokenInfo.curr / tokenInfo.fastRunnerLow) - 1
    }
    if (tokenInfo.purchased && ((tokenInfo.curr / tokenInfo.purchasedPrice) - 1) * 100 >= creds.confirmPercent) {
        tokenInfo.goneAboveConfirmPerc = true
    }
}