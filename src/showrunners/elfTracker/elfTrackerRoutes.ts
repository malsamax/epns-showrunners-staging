import { Router, Request, Response, NextFunction } from 'express';
import { Container } from 'typedi';
import ElfTrackerChannel from './elfTrackerChannel';
import middlewares from '../../api/middlewares';
import { celebrate, Joi } from 'celebrate';

const route = Router();

export default (app: Router) => {
  app.use('/showrunners/element_tracker', route);

  /**
   * Send Message
   * @description Send a notification via the Element.fi tracker showrunner
   * @param {boolean} simulate whether to send the actual message or simulate message sending
   */
  route.post(
    '/send_message',
    celebrate({
      body: Joi.object({
        simulate: [Joi.bool(), Joi.object()],
      }),
    }),
    middlewares.onlyLocalhost,
    async (req: Request, res: Response, next: NextFunction) => {
      const Logger = Container.get('logger');
      Logger.debug('Calling /showrunners/element_tracker/send_message endpoint with body: %o', req.body )
      try {
        const elfTracker = Container.get(ElfTrackerChannel);
        const result = await elfTracker.sendMessageToContract(req.body.simulate);

        return res.status(201).json({result});
      } catch (e) {
        Logger.error('🔥 error: %o', e);
        return next(e);
      }
    },
  );

  /**
   * Get Expired Tranches Array
   * @description Get array of all Element.fi tranches that are expired
   */
  route.post(
    '/get_expired_tranches_array',
    celebrate({
      body: Joi.object({
        simulate: [Joi.bool(), Joi.object()],
      }),
    }),
    middlewares.onlyLocalhost,
    async (req: Request, res: Response, next: NextFunction) => {
      const Logger = Container.get('logger');
      Logger.debug('Calling /showrunners/element_tracker/get_expired_tranches_array endpoint with body: %o', req.body )
      try {
        const elfTracker = Container.get(ElfTrackerChannel);
        const result = elfTracker.getExpiredTranchesArray();
        Logger.info("result: %o", result)

        return res.status(201).json({result});
      } catch (e) {
        Logger.error('🔥 error: %o', e);
        return next(e);
      }
    },
  );

  /**
   * Check all tranches for all related user token balances
   * @description Check the balance of each token in each tranche
   * @param {boolean} simulate whether to upload to ipfs or simulate the ipfs payload
   */
  route.post(
    '/check_user_tranches',
    celebrate({
      body: Joi.object({
        simulate: [Joi.bool(), Joi.object()],
      }),
    }),
    middlewares.onlyLocalhost,
    async (req: Request, res: Response, next: NextFunction) => {
      const Logger = Container.get('logger');
      Logger.debug('Calling /showrunners/element_tracker/check_user_tranches endpoint with body: %o', req.body )
      try {
        const elfTracker = Container.get(ElfTrackerChannel);
        const result = await elfTracker.checkUserTranches(req.body.user, req.body.provider, null, null, req..simulate);

        return res.status(201).json({result});
      } catch (e) {
        Logger.error('🔥 error: %o', e);
        return next(e);
      }
    },
  );

  /**
   * Check Tranche
   * @description Check a particular user's balance of each token for a particular tranche
   */
  route.post(
    '/check_tranche',
    celebrate({
      body: Joi.object({
        simulate: [Joi.bool(), Joi.object()],
      }),
    }),
    middlewares.onlyLocalhost,
    async (req: Request, res: Response, next: NextFunction) => {
      const Logger = Container.get('logger');
      Logger.debug('Calling /showrunners/element_tracker/check_tranche endpoint with body: %o', req.body )
      try {
        const elfTracker = Container.get(ElfTrackerChannel);
        const result = await elfTracker.checkTranche(req.body.user, req.body.provider, req.body.tranche, null, null);

        return res.status(201).json({result});
      } catch (e) {
        Logger.error('🔥 error: %o', e);
        return next(e);
      }
    },
  );
};
