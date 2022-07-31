import React, { useState } from 'react';
import './styles/menu.css';
import { Link, useLocation, useHistory} from "react-router-dom";

const Menu = () => {
    const history = useHistory();
    const pathname = history.location.pathname;

    return (
        <div className='Menu-container'>
            <div className='Menu'>
                <div className='button-wrapper__deposit'>
                    <Link to="/deposit">
                        <button className='button__deposit' 
                                style={{backgroundColor: pathname === "/deposit" ? "rgb(170, 166, 157)" : "rgb(64, 64, 64)"}}>
                                Deposit
                        </button>
                    </Link>
                </div>
                <div className='button-wrapper__portfolio'>
                    <Link to="/portfolio">
                        <button className='button__portfolio' 
                                style={{backgroundColor: pathname === "/portfolio" ? "rgb(170, 166, 157)" : "rgb(64, 64, 64)" }}>
                                Portfolio
                        </button>
                    </Link>
                </div>
                <div className='button-wrapper__dashboard'>
                    <Link to="/dashboard">
                        <button className='button__dashboard' 
                                style={{backgroundColor: pathname === "/dashboard" ? "rgb(170, 166, 157)" : "rgb(64, 64, 64)" }}>
                                Dashboard
                        </button>
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default Menu;