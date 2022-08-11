import React from 'react';
import './styles/header.css';

const Header = () => {
    return (
        <div className='Header'>
            <div>
                <h1 className='title__header'>Gravity</h1>
            </div>
            <div>
                <button className='button__connect-wallet'>Connect Wallet</button>
            </div>
        </div>
    )
}

export default Header;