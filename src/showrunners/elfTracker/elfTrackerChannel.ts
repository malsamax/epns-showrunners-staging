// @name: Elemenet.fi Tracker Cnannel
// @version: 1.0

import { Service, Inject, Container } from 'typedi';
import config from '../../config';
import showrunnersHelper from '../../helpers/showrunnersHelper';
import PQueue from 'p-queue';
import { ethers, logger } from 'ethers';
import NotificationHelper, {InfuraSettings, NetWorkSettings, EPNSSettings} from '../../sdk/index';
import { resolve } from 'dns';
const queue = new PQueue();
let retries = 0;

const infuraSettings: InfuraSettings = {
  projectID: config.infuraAPI.projectID,
  projectSecret: config.infuraAPI.projectSecret
}
const settings: NetWorkSettings = {
  alchemy: config.alchemyAPI,
  infura: infuraSettings,
  etherscan: config.etherscanAPI
}
const epnsSettings: EPNSSettings = {
  network: config.web3RopstenNetwork,
  contractAddress: config.deployedContract,
  contractABI: config.deployedContractABI
}
const elementTrancheABI = require('./elf-tranche.json')
const NETWORK_TO_MONITOR = config.web3RopstenNetwork;
const provider = ethers.getDefaultProvider(NETWORK_TO_MONITOR, {
  etherscan: (config.etherscanAPI ? config.etherscanAPI : null),
  infura: (config.infuraAPI ? {projectId: config.infuraAPI.projectID, projectSecret: config.infuraAPI.projectSecret} : null),
  alchemy: (config.alchemyAPI ? config.alchemyAPI : null),
});

const CUSTOMIZABLE_SETTINGS = {
  'precision': 3,
  'ticker': 24,
}

@Service()
export default class ElfTrackerChannel {
  running: any;
  UserTokenModel: any;
  constructor(
    @Inject('logger') private logger,
  ) {
  }
  public async getWalletKey() {
    var path = require('path');
    const dirname = path.basename(__dirname);
    const wallets = config.showrunnerWallets[`${dirname}`];
    const currentWalletInfo = await showrunnersHelper.getValidWallet(dirname, wallets);
    const walletKeyID = `wallet${currentWalletInfo.currentWalletID}`;
    const walletKey = wallets[walletKeyID];
    return walletKey;
  }

  public async getExpiredTranchesArray() {
    let elementTranches = [];
    const fetch = require('node-fetch');
    let url = "https://raw.githubusercontent.com/element-fi/elf-deploy/main/addresses/mainnet.json";
    let settingsfetch = { method: "Get" };
    await fetch(url, settingsfetch)
    .then(res => res.json())
      .then((elfDeployment) => {
        for (const asset in elfDeployment.tranches) {
          elfDeployment.tranches[asset].forEach(tranche => {
            let tranche_info = {
              "underlying":asset,
              "expiration":tranche.expiration,
              "address":tranche.address,
              "ptPoolAddress":tranche.ptPool.address,
              "ytPoolAddress":tranche.ytPool.address
            }
            let timestamp = Math.floor(Date.now() / 1000);
            if (tranche.expiration < timestamp){
              elementTranches.push(
                tranche_info
              );
            }
          });
        }
      })
    return elementTranches;
  }

  public async sendMessageToContract(simulate) {
    const logger = this.logger;

    // Ignore call if this is already running
    if (this.running) {
      logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Elemenet.fi Tracker instance is already running! Skipping...`);
      return;
    }
    this.running = true;
    const walletKey = await this.getWalletKey();
    const sdk = new NotificationHelper(NETWORK_TO_MONITOR, walletKey, settings, epnsSettings);
    const users = await sdk.getSubscribedUsers()
    const elementTranches = await this.getExpiredTranchesArray();

    users.forEach(async user => {
      const walletKey = await this.getWalletKey()
      const sdk = new NotificationHelper(NETWORK_TO_MONITOR, walletKey, settings, epnsSettings);
      await queue.add(() => this.processAndSendNotification(user, NETWORK_TO_MONITOR, sdk, simulate, elementTranches));
      logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Added processAndSendNotification for user:%o `, user)
    });
    
    await queue.onIdle();
    this.running = false;
    logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Done for all`);
  }

  public async processAndSendNotification(user, NETWORK_TO_MONITOR, sdk, simulate, elementTranches) {
    try{
      // if user has any amount of principal token, interest token, LP principal or LP yield .. notify them pool is expiring
      const object = await this.checkUserTranches(user, NETWORK_TO_MONITOR, sdk, elementTranches, simulate);
      if (object.success) {
        const user = object.user
        const title = "Element.fi Alert!";
        const message = "Expired Element Finance token balance in your wallet!";
        const payloadTitle = "Element Token ready for redemption!";
        const payloadMsg = this.prettyExpiredTranches(object.userTranches);
        const notificationType = 3;
        const tx = await sdk.sendNotification(user, title, message, payloadTitle, payloadMsg, notificationType, simulate)
        // logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- transaction: %o`, tx);
        logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Transaction successful | Notification Sent`,);
        logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- 🙌 Elemenet.fi Tracker Channel Logic Completed for user : %o`, user);
      }
      else{
        // logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- No wallet movement: %o`, object)
      }
    } catch (error) {
      logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Sending notifications failed to user: %o | error: %o`, user, error)
      if (retries <=5 ) {
        retries++
        await queue.add(() => this.processAndSendNotification(user, NETWORK_TO_MONITOR, sdk, simulate, elementTranches));
      } else {
        retries = 0
      }
    }
  }

  public async checkUserTranches(user, networkToMonitor, sdk, elementTranches, simulate) {
    const logger = this.logger;
    //simulate object settings START
    try{
      const logicOverride = typeof simulate == 'object' ? ((simulate.hasOwnProperty("logicOverride") && simulate.logicOverride.mode) ? simulate.logicOverride.mode : false) : false;
      const simulateApplyToAddr = logicOverride && simulate.logicOverride.hasOwnProperty("applyToAddr") ? simulate.logicOverride.applyToAddr : false;
      const simulateNetwork = logicOverride && simulate.logicOverride.hasOwnProperty("network") ? simulate.logicOverride.network : false;
      if(!sdk){
        const walletKey = await this.getWalletKey()
        sdk = new NotificationHelper(NETWORK_TO_MONITOR, walletKey, settings, epnsSettings);
      }
      // check and recreate provider mostly for routes
      if (!elementTranches) {
        logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Mostly coming from routes... rebuilding interactable erc721s`);
        //need token address
        elementTranches = this.getExpiredTranchesArray();
        logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Rebuilt interactable erc721s --> %o`, elementTranches);
      }
      if(!user){
        if(simulateApplyToAddr){
          user = simulateApplyToAddr
        }
        else{
          logger.debug(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- user is not defined`)
        }
      }
    }
    catch(err){
      logger.error(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- error: ${err}`)
    }
    //simulate object settings END

    // check and return if the wallet is the channel owner
    if (await this.isChannelOwner(user)) {
      return {
        success: false,
        data: "Channel Owner User: " + user
      };
    }

    let userTranches = [];
    let promises = [];

    for (let tranche = 0; tranche < elementTranches.length; tranche++) {
      promises.push(this.checkTranche(user, networkToMonitor, tranche, elementTranches, sdk, simulate))
    }

    const results = await Promise.all(promises)
    userTranches = results.filter(tranche => tranche.status === 'EXPIRED TOKEN HELD')
    // logger.info('userTranches: %o', userTranches)
    if(userTranches.length>0){
      return {
        success: true,
        user,
        userTranches
      }
    }
    else{
      return {
        success: false,
        data: "No expired tranches for wallet: " + user
      }
    }
  }

  public async isChannelOwner(user) {
    const walletKey = await this.getWalletKey();
    if (ethers.utils.computeAddress(walletKey) === user) {
      return true;
    }
    return false;
  }

  public async checkTranche(user, networkToMonitor, tranche, elementTranches, sdk) {
    const logger = this.logger;

    // logger.info("checking Tranche for user %s", user);

    // check and recreate provider mostly for routes
    if (!elementTranches) {
      logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Mostly coming from routes... rebuilding interactable erc721s`);
      // need tranche number (given by order in deployment json)
      const walletKey = await this.getWalletKey()
      sdk = new NotificationHelper(NETWORK_TO_MONITOR, walletKey, settings, epnsSettings);
      elementTranches = this.getExpiredTranchesArray();
      logger.info(`[${new Date(Date.now())}]-[Elemenet.fi Tracker]- Rebuilt interactable erc721s --> %o`, elementTranches);
    }

    return new Promise((resolve) => {

    // check if ANY balance of principle, yield, LP principle or LP yield token. if so; add notification for this tranche
    this.checkAllTokenBalances(user, networkToMonitor, tranche, elementTranches[tranche], sdk)
      .then((tokenOwned: any) => {

        let expiration = elementTranches[tranche].expiration;

        // if user owns expired token ...
        if (tokenOwned){
          let status = 'EXPIRED TOKEN HELD';
          resolve({
            tokenOwned,
            status,
            expiration
          })
        }
      })
    })
  }

  public async checkAllTokenBalances(user, networkToMonitor, tranche_index, tranche, sdk){
    const logger = this.logger;

    if(!tranche){
      const walletKey = await this.getWalletKey()
      sdk = new NotificationHelper(NETWORK_TO_MONITOR, walletKey, settings, epnsSettings);
      let elementTranches = this.getExpiredTranchesArray();
      tranche = elementTranches[tranche_index];
    }

    // let contracts = [];
    let trancheContract = await sdk.getContract(tranche.address, elementTrancheABI);
    let ptPoolContract = await sdk.getContract(tranche.ptPoolAddress, elementTrancheABI);
    let ytPoolContract = await sdk.getContract(tranche.ytPoolAddress, elementTrancheABI);
    let contracts = [trancheContract, ptPoolContract, ytPoolContract];

    return new Promise((resolve) => {
    this.getTokensBalance(user, contracts)
    .then((tokenInfo : any) => {
      resolve(tokenInfo)
      })
    })
  }

  async getTokensBalance(user, tokenContracts){
    const logger = this.logger;
    for (let i = 0; i < tokenContracts.length; i++) {
      let contract = tokenContracts[i].contract;
      let tokenInfo;

      tokenInfo = contract.decimals()
        .then(decimals => {
          return contract.name()
            .then(name => {
              // logger.info("checking balance of %s", name);
              return contract.balanceOf(user)
              .then(res=> {
                let rawBalance = Number(Number(res));
                let tokenBalance = Number(Number(rawBalance/Math.pow(10, decimals)).toLocaleString());
                return {
                  user,
                  name,
                  balance: tokenBalance
                }
              })
            })
        })
      
      if(tokenInfo.balance > 0){
        return new Promise((resolve, reject) => {
          resolve (tokenInfo)
        })
      }
    }
    // logger.info("no balance of any token in this tranche found for user %s", user);
  }

  // Pretty format expired tranches
  public prettyExpiredTranches(expiredTranches) {
    const logger = this.logger;
    const h1 = "[d:Expired Tranches & Latest Balance]\n---------";

    let body = '';

    expiredTranches.map(tranche => {
      // convert to four decimal places at max
      const precision = CUSTOMIZABLE_SETTINGS.precision;

      let balance = Number(parseFloat(tranche.tokenOwned.balance).toFixed(precision));
      let ticker_split = tranche.tokenOwned.name.trim().split(" ")
      let ticker =  ticker_split[ticker_split.length -1]+ ":";
      const padding = CUSTOMIZABLE_SETTINGS.ticker - ticker.length;
      const spaces = ("               ").slice(-padding);

      if (padding > 0) {
        ticker = ticker + spaces;
      }

      ticker = `[➕] [d:${ticker}]`;
      body = `${body}\n${ticker}  [b:${balance}] [d: Position has expired! Ready for redemption]`;
    })

    const prettyFormat = `${h1}\n${body}[timestamp: ${Math.floor(Date.now() / 1000)}]`;
    logger.info(`[${new Date(Date.now())}]-[Element.fi Tracker]- Pretty Formatted Expired Tranches \n%o`, prettyFormat);

    return prettyFormat;
  }
}



