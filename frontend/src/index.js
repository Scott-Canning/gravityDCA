import React from 'react';
import ReactDOM from 'react-dom';
import Gravity from './Gravity.js'
import './styles/index.css';
import { Web3ReactProvider } from '@web3-react/core';
import { MetaMaskProvider } from './hooks/MetaMask.js';
import { Web3Provider } from "@ethersproject/providers";

function getLibrary(provider) {
  const library = new Web3Provider(provider);
  library.pollingInterval = 10000;
  return library;
}

ReactDOM.render(
  <Web3ReactProvider getLibrary={getLibrary}>
    <MetaMaskProvider>
      <Gravity/>
    </MetaMaskProvider>
  </Web3ReactProvider>,
  document.querySelector('#root')
);