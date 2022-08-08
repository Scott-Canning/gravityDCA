import React from 'react';
import Select from 'react-select';
import './styles/deposit.css';
import Header from '../components/header';
import Menu from '../components/menu';
import { selectStyles } from './styles/selectStyles';
import dai_icon from '../images/dai_icon.png';
import eth_icon from '../images/eth_icon.png';
import wbtc_icon from '../images/wbtc_icon.png';

const Deposit = () => {
    const [fundingAsset, setFundingAsset] = React.useState("");
    const [purchaseAsset, setPurchaseAsset] = React.useState("");

    const fundingAssets = 
    [
        {value:'dai',label: 'DAI', image: dai_icon},
        {value: 'weth', label: 'WETH', image: eth_icon},
        {value: 'wbtc', label: 'WBTC', image: wbtc_icon}
    ];

    const purchaseAssets = 
    [
        {value:'dai',label: 'DAI', image: dai_icon},
        {value: 'weth', label: 'WETH', image: eth_icon},
        {value: 'wbtc', label: 'WBTC', image: wbtc_icon}
    ];

    return (
        <div className='content__deposit'>
            <div>
                <Header/>
            </div>
            <div>
                <div className='menu-wrapper__deposit'>
                    <Menu/>
                </div>
                <div className='deposit-container'>
                    <div className='title-container__deposit'>
                        <p className='title__deposit'>Configure Your Dollar Cost Averaging Strategy</p>
                    </div>
                    <div className='init-new-strategy-container'>
                        <div className='asset-selection-container'>
                            <div className='funding-asset-container'>
                                <div className='title-container__funding-asset'>
                                    Funding Asset
                                </div>
                                <div className='selector-container__funding-asset'>
                                    <Select 
                                        options={fundingAssets}
                                        styles={selectStyles}
                                        formatOptionLabel={asset => (
                                        <div className='option-container'>
                                            <div>
                                                <img src={asset.image} alt="NA" className='option-img'/>
                                            </div>
                                            <div className='option-text'>
                                                {asset.label}
                                            </div>
                                        </div>
                                        )}
                                    />
                                </div>
                            </div>
                            <div className='purchase-asset-container'>
                            <div className='title-container__purchase-asset'>
                                    Purchase Asset
                                </div>
                                <div className='selector-container__purchase-asset'>
                                    <Select 
                                        options={purchaseAssets}
                                        styles={selectStyles}
                                        formatOptionLabel={asset => (
                                        <div className='option-container'>
                                            <div>
                                                <img src={asset.image} alt="NA" className='option-img'/>
                                            </div>
                                            <div className='option-text'>
                                                {asset.label}
                                            </div>
                                        </div>
                                        )}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className='deposit-amount-container'>
                            deposit amount container
                        </div>
                        <div className='button-wrapper__inititate-strategy'>
                            button wrapper container
                        </div>
                    </div>
                    <div className='deployment-schedule-container'>

                    </div>
                </div>
            </div>
        </div>
    )
}

export default Deposit;