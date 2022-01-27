const creds = require("../creds.json");

const timestamp = (year, month, date, hour, minute, second, parametered = false) => {
    if (typeof year == 'string') { year = parseInt(year) }
    if (typeof month == 'string') { month = parseInt(month) }
    if (typeof date == 'string') { date = parseInt(date) }
    if (typeof hour == 'string') { hour = parseInt(hour) }
    if (typeof second == 'string') { second = parseInt(second) }
    if (typeof minute == 'string') { minute = parseInt(minute) }

    let thirty = [4, 6, 9, 11], thirty1 = [1, 3, 5, 7, 8, 10, 12]

    hour += Math.floor(minute / 60) + 6
    date += Math.floor(hour / 24)
    if (date == 0) {
        month -= 1
        if (month == 0) {
            month = 12
            year -= 1
        }
        if (thirty.includes(month)) { date = 30 }
        else if (month == 2 && (year % 4 != 0)) { date = 28 }
        else if (month == 2 && (year % 4 == 0)) { date = 29 }
        else if (thirty1.includes(month)) { date = 31 }
    }
    if (thirty.includes(month)) { month += Math.floor(date / 31) }
    else if (month == 2 && (year % 4 != 0)) { month += Math.floor(date / 29) }
    else if (month == 2 && (year % 4 == 0)) { month += Math.floor(date / 30) }
    else if (thirty1.includes(month)) { month += Math.floor(date / 32) }
    year += Math.floor(month / 13)

    month = (month % 13)
    if (month == 0) { month = 1 }
    if (thirty.includes(month)) { date = (date % 31) }
    else if (month == 2 && (year % 4 != 0)) { date = (date % 29) }
    else if (month == 2 && (year % 4 == 0)) { date = (date % 30) }
    else if (thirty1.includes(month)) { date = (date % 32) }
    if (date == 0) { date = 1 }
    hour = (hour % 24)
    minute = (minute % 60)

    if (minute < 0) {
        minute += 60
    }
    if (hour < 0) {
        hour += 24
    }
    if (date <= 0) {
        month -= 1
        if (month == 0) {
            month = 12
            year -= 1
        }
        if (thirty.includes(month)) { date = 30 }
        else if (month == 2 && (year % 4 != 0)) { date = 28 }
        else if (month == 2 && (year % 4 == 0)) { date = 29 }
        else if (thirty1.includes(month)) { date = 31 }
    }

    let nHour = ""
    if (month < 10) {
        month = '0' + month.toFixed(0)
    }
    if (date < 10) {
        date = '0' + date.toFixed(0)
    }
    if (hour < 10) {
        hour = '0' + hour.toFixed(0)
        nHour = '0' + (hour - 1).toFixed(0)
    }
    if (hour == 10) {
        nHour = '0' + (hour - 1).toFixed(0)
    }
    if (minute < 10) {
        minute = '0' + minute.toFixed(0)
    }
    if (second < 10) {
        second = '0' + second.toFixed(0)
    }

    if (typeof year != 'string') {
        year = year.toFixed(0)
    }
    if (typeof month != 'string') {
        month = month.toFixed(0)
    }
    if (typeof date != 'string') {
        date = date.toFixed(0)
    }
    if (typeof hour != 'string') {
        hour = hour.toFixed(0)
        nHour = (hour - 1).toString()
    }
    if (typeof minute != 'string') {
        minute = minute.toFixed(0)
    }
    if (typeof second != 'string') {
        second = second.toFixed(0)
    }

    if (parametered) {
        let cTime = year + "-" + month + "-" + date + "%20" + hour + "%3A" + minute + "%3A" + second
        let oTime = year + "-" + month + "-" + date + "%20" + nHour + "%3A" + minute + "%3A" + second
        return "start=" + oTime + "&end=" + cTime
    }
    else {
        return year + "-" + month + "-" + date + " " + hour + ":" + minute + ":" + second
    }
}

var countDecimals = function (value) {
    if (Math.floor(value) === value) return 0;
    if (value <= 1e-7) {
        let str = value.toString(), num = ''
        for (let i = 3; i < str.length; i++) {
            num += str[i]
        }
        return parseInt(num)
    }
    return value.toString().split(".")[1].length || 0;
}

//DateMark needs to be TZ-timestamp
let cbTimestamp = (dateMark = '', granularity = creds.granularity, offset = 0) => {
    let date
    if (dateMark == '') {
        date = new Date()
    }
    else {
        date = new Date(dateMark)
    }

    return (Math.floor((Math.floor(date.getTime() / 1000) - offset) / granularity) * granularity)
}

let timestampTZ = (dateMark = '') => {
    let ret = ""
    for (let i = 0; i < dateMark.length; i++) {
        if (dateMark[i] == ' ') {
            ret += 'T'
        }
        else {
            ret += dateMark[i]
        }
    }
    ret += 'Z'
    return ret
}

//Converts regular timestamp -> TZ-timestamp -> cbTimestamp
let tweakedCbTimestamp = (dateMark = '') => {
    let t = timestampTZ(dateMark)
    return cbTimestamp(t)
}

let filter = (obj, predicate) => 
    Object.keys(obj)
          .filter( key => predicate(obj[key]) )
          .reduce( (res, key) => (res[key] = obj[key], res), {} );

module.exports = {
    countDecimals: countDecimals, timestamp: timestamp, cbTimestamp: cbTimestamp, filter: filter, tweakedCbTimestamp: tweakedCbTimestamp,
    timestampTZ: timestampTZ
}