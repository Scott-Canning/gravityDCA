import React from 'react';
import './styles/deposit.css';
import Header from '../components/header';
import Menu from '../components/menu';

const Deposit = () => {
    const [depositAsset, setDepositAsset] = React.useState("");

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
                                    Select Funding Asset
                                </div>
                                <div className='selector-container__funding-asset'>
                                    <div>
                                        <select className='selector__funding-asset' selected={depositAsset} onChange={e => setDepositAsset(e.target.value)}>
                                            <option className='option-asset' value="" { ...depositAsset === '' ? 'selected="selected"' : '' }></option>
                                            <option className='option-asset' value="DAI" { ...depositAsset === 'DAI' ? 'selected="selected"' : '' }>DAI</option>
                                            <option className='option-asset' value="DAI" { ...depositAsset === 'WETH' ? 'selected="selected"' : '' }>WETH</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className='purchase-asset-container'>
                            <div className='title-container__purchase-asset'>
                                    Select Purchase Asset
                                </div>
                                <div className='selector-container__purchase-asset'>
                                    Purchase Asset Selector
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