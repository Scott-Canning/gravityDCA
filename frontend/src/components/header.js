import React, { useState, useEffect } from 'react';
import './styles/header.css';
import useMetaMask from '../hooks/MetaMask.js';
import { formatAddress } from '../utilities/formatAddress';
import { networkIdMap } from '../utilities/networks';


const Header = () => {
    const [network, setNetwork] = useState('');
    const [isHovering, setHover] = useState(false);
    const { connect, account, disconnect, isActive, library } = useMetaMask();

    useEffect(() => {
        getNetwork().then(val => {
            setNetwork(val);
        })
    }, [connect]);

    const getNetwork = async () => {
        try {
            if(library) {
            const nw = await library.getNetwork();
            return nw.chainId;
            }
        } catch(error) {
            console.log('Unable to get network: ', error)
        }
    }

    return (
        <div className='header'>
            <div>
                <h1 className='title__header'>Gravity</h1>
            </div>
            <div className='wallet-connection-container'>
                <div className='network-indicator-container'>
                    <div className='network-indicator'>
                    { isActive ? '🟢 ' + networkIdMap[network] : '🔴 Not Connected' }
                    </div>
                </div>
                <div className='button-container__connect-wallet'>
                    <button className='button__connect-wallet' onClick={isActive && isHovering ? disconnect : connect}
                        onMouseEnter={() => setHover(true)}
                        onMouseLeave={() => setHover(false)}>
                        { isActive ?
                            (isHovering ? 'Disconnect' : formatAddress(account)) :
                            ('Connect Wallet')
                        }
                    </button>
                </div>
            </div>
        </div>
    )
}

export default Header;