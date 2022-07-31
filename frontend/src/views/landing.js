import React from 'react';
import './styles/landing.css';
import { Link } from "react-router-dom";

const Landing = () => {

    return (
        <div>
            <div className='content__landing'>
                <div className='title-wrapper'>
                    <h1 className='title__landing'>Gravity</h1>
                </div>
                <div className='sub-title-wrapper'>
                    <h4 className='sub-title'>Automated On-chain Dollar Cost Averaging Strategies</h4>
                </div>
                <div className='disclaimer-wrapper'>
                    <p className='disclaimer'>
                        DISCLAIMER: Gravity is in alpha testing. The application is provided "as-is", at your own 
                        risk, and without warranties of any kind. The information provided on this website does not 
                        constitute investment advice, financial advice, trading advice, or any other sort of advice 
                        and you should not treat any of the website's content as such. Gravity does not recommend 
                        that any cryptocurrency should be bought, sold, or held by you. Do conduct your own due 
                        diligence and consult your financial advisor before making any investment decisions.
                    </p>
                </div>
                <div className='button-wrapper__launch-app'>
                    <Link to="/deposit">
                        <button className='button__launch-app'>Launch App</button>
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default Landing;