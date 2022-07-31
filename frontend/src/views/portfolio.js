import React from 'react';
import './styles/portfolio.css';
import Header from '../components/header';
import Menu from '../components/menu';

const Portfolio = () => {

    return (
        <div className='content'>
            <div>
                <Header/>
            </div>
            <div className='menu-wrapper__portfolio'>
                <Menu/>
            </div>
        </div>
    )
}

export default Portfolio;