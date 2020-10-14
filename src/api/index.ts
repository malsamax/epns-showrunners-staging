import { Router } from 'express';

import btcTicker from './routes/showrunners_btcticker';
import ethTicker from './routes/showrunners_ethticker';
import ensTicker from './routes/showrunners_ensticker';
import gasTicker from './routes/showrunners_gasticker';
import gasstickeri from './routes/showrunner_gasstickeri';


// guaranteed to get dependencies
export default () => {
	const app = Router();

	// -- SHOWRUNNERS ROUTES
	btcTicker(app);
	ethTicker(app);
	ensTicker(app);
	gasTicker(app);
	gasstickeri(app);
	// Finally return app
	return app;
}