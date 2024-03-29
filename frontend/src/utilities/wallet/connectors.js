import { InjectedConnector } from "@web3-react/injected-connector";
import { revNetworkIdMap } from "../networks";

export const injected = new InjectedConnector({ supportedChainIds: [
                                                                    revNetworkIdMap['Polygon Mumbai'], 
                                                                    revNetworkIdMap['Polygon'],
                                                                    revNetworkIdMap['Local Host'] 
                                                                   ]});