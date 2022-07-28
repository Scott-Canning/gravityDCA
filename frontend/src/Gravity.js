import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router, Route } from 'react-router-dom'
import './styles/Gravity.css';
import Landing from './views/landing';
import Deposit from './views/deposit';
import Portfolio from './views/portfolio';
import Dashboard from './views/dashboard';

const Gravity = () => {
    return ( 
        <Router>
            <div className="Gravity">
                <Route exact component={Landing} path="/" element={Landing}/>
                <Route exact component={Deposit} path="/deposit" element={Deposit}/>
                <Route exact component={Portfolio} path="/portfolio" element={Portfolio}/>
                <Route exact component={Dashboard} path="/dashboard" element={Dashboard}/>
            </div>
        </Router>
    )
}

export default Gravity;