import React from 'react';
import './styles/dashboard.css';
import Header from '../components/header';
import Menu from '../components/menu';

const Dashboard = () => {

    return (
        <div className='content'>
            <div>
                <Header/>
                <Menu/>
            </div>
        </div>
    )
}

export default Dashboard;