const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');

const errorController = require('./controllers/error');
const bot = require('../bot/app');

(async () => {
    await bot.getAllTokenIds()
    // await bot.coinbaseCandles()
    await bot.getPreviousFills()
    console.log("Initialized")

    bot.begin()
})();


const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// app.use('/admin', adminRoutes);
app.use(userRoutes);
app.use(errorController.get404);

app.listen(3000);