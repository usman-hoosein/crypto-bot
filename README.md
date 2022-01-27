# crypto-bot
Crypto bot that continuously monitors and trades cryptocurrency based on the specified parameters

1. Run the commands to install the necessary packages:
  
      npm init
  
      npm install axios qs crypto fs path express body-parser
 
2. Enter the credentials to coinbase or kraken keys where specified at bot/creds.json file
3. Specify any additional parameters at bot/creds.json file
4. To begin the bot, run:
  node ./bin/www 
