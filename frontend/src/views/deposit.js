import React, { useEffect, useRef, useState } from 'react';
import Select from 'react-select';
import './styles/deposit.css';
import Header from '../components/header';
import Menu from '../components/menu';
import { selectStyles } from './styles/selectStyles';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    defaults
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { add, getMonth, getDate, getYear } from 'date-fns';
import dai_icon from '../images/dai_icon.png';
import eth_icon from '../images/eth_icon.png';
import wbtc_icon from '../images/wbtc_icon.png';

const Deposit = () => {
    const [fundingAsset, setFundingAsset] = useState("");
    const [purchaseAsset, setPurchaseAsset] = useState("");
    const [fundingAmount, setFundingAmount] = useState("");
    const [purchaseAmount, setPurchaseAmount] = useState("");
    const [purchaseInterval, setPurchaseInterval] = useState("");
    const [chartLabels, setChartLabels] = useState([]);
    const [chartData, setChartData] = useState([]);

    const purchaseAssetRef = useRef();

    useEffect(() => {
        calcDeploymentSchedule();
    }, [purchaseInterval, fundingAmount, purchaseAmount])

    useEffect(() => {
        if(fundingAsset !== '' && purchaseAsset !== '' && fundingAsset === purchaseAsset) {
            window.alert("Funding asset and purchase asset must be different tokens");
            setPurchaseAsset('');
            resetPurchaseAssetSelect();
        }
    }, [fundingAsset, purchaseAsset])


    const fundingAssetsOptions = 
    [
        {value: 'dai', label: 'DAI', image: dai_icon},
        {value: 'weth', label: 'WETH', image: eth_icon},
        {value: 'wbtc', label: 'WBTC', image: wbtc_icon}
    ];

    const fundingAssetMap = 
    {
        'DAI': dai_icon,
        'WETH': eth_icon,
        'WBTC': wbtc_icon
    }

    const purchaseAssetsOptions = 
    [
        {value: 'dai', label: 'DAI', image: dai_icon},
        {value: 'weth', label: 'WETH', image: eth_icon},
        {value: 'wbtc', label: 'WBTC', image: wbtc_icon}
    ];

    const intervalOptions =
    [
        {value: 1, label: '1 Day'},
        {value: 7, label: '7 Days'},
        {value: 14, label: '14 Days'},
        {value: 21, label: '21 Days'},
        {value: 30, label: '30 Days'},
    ]

    const fundingAssetChange = (asset) => {
        setFundingAsset(asset.label);
    };

    const purchaseAssetChange = (asset) => {
        setPurchaseAsset(asset.label);
    };

    const purchaseIntervalChange = (interval) => {
        setPurchaseInterval(interval.value);
    };

    const resetPurchaseAssetSelect = () => {
        purchaseAssetRef.current.setValue('');
    }

    function validateAmount(e) {
        var theEvent = e || window.event;
        // handle paste
        if (theEvent.type === 'paste') {
            key = event.clipboardData.getData('text/plain');
        } else {
        // handle key press
            var key = theEvent.keyCode || theEvent.which;
            key = String.fromCharCode(key);
        }
        var regex = /[0-9]|\./;
        if( !regex.test(key) ) {
          theEvent.returnValue = false;
          if(theEvent.preventDefault) theEvent.preventDefault();
        }
    }

    ChartJS.register(
        CategoryScale,
        LinearScale,
        BarElement,
        Title,
        Tooltip,
    );

    const deploymentSchedule = {
        labels: chartLabels,
        datasets: [
            {
                id: '',
                label: fundingAsset,
                data: chartData,
                backgroundColor: 'rgb(141, 213, 128)',
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: 'Estimated Deployment Schedule',
                font: 'Futura'
            },
        },
        scales: {
            y: {
                suggestedMin: 0,
                suggestedMax: 500
            }
        }
    };

    const calcDeploymentSchedule = async () => {
        if(purchaseInterval !== '' && fundingAmount !== '' && purchaseAmount  !== '') {
            setChartLabels([]);
            setChartData([]);
            
            let date = new Date().setHours(12, 0, 0, 0);
            let purchases = parseInt(fundingAmount / purchaseAmount);
            const remainder = fundingAmount % purchaseAmount;
            if(remainder > 0) {
                purchases += 1;
            }

            for(let i = 0; i < purchases; i++) {
                if(remainder > 0 && (i === purchases - 1)) {
                    setChartData(oldArray => [...oldArray, remainder]);
                } else {
                    setChartData(oldArray => [...oldArray, purchaseAmount]);
                }

                date = add(date, {
                    year: 0,
                    month: 0,
                    days: purchaseInterval
                })
                let formattedDate = (getMonth(date) + 1) + '/' + getDate(date) + '/' + getYear(date);
                setChartLabels(oldArray => [...oldArray, formattedDate]);
            }
        }
    }
    
    defaults.font.family = 'futura';
    defaults.color = 'rgb(215, 211, 211)';

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
                        <p className='title__deposit'>Configure A Dollar Cost Averaging Strategy</p>
                    </div>
                    <div className='init-new-strategy-container'>
                        <div className='asset-selection-container'>
                            <div className='funding-asset-container'>
                                <div className='title-container__funding-asset'>
                                    Funding Asset
                                </div>
                                <div className='selector-container__funding-asset'>
                                    <Select 
                                        options={fundingAssetsOptions}
                                        styles={selectStyles}
                                        onChange={fundingAssetChange}
                                        placeholder={<div>Select a token</div>}
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
                                        options={purchaseAssetsOptions}
                                        styles={selectStyles}
                                        onChange={purchaseAssetChange}
                                        placeholder={<div>Select a token</div>}
                                        ref={purchaseAssetRef}
                                        formatOptionLabel={asset => (
                                            <div className='option-container'>
                                                <div>
                                                    <img src={asset.image} alt="" className='option-img'/>
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
                        <div className='amount-interval-container'>
                            <div className='funding-amount-container'>
                                <div className='title-container__funding-amount'>
                                    Funding Amount
                                </div>
                                <div className='input-container__funding-amount'>
                                    <input 
                                        className='input-amounts'
                                        value={fundingAmount} 
                                        type='text' 
                                        onKeyPress={e => validateAmount(e)}
                                        onInput={e => setFundingAmount(e.target.value)}
                                        placeholder="0.0"
                                    />
                                </div>
                                <div className='funding-asset-display'>
                                    <div className='option-container'>
                                        <div>
                                            <img src={fundingAssetMap[fundingAsset]} alt="" className='option-img'/>
                                        </div>
                                        <div className='option-text'>
                                            {fundingAsset}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className='purchase-amount-container'>
                                <div className='title-container__purchase-amount'>
                                    Purchase Amount
                                </div>
                                <div className='input-container__purchase-amount'>
                                    <input 
                                        className='input-amounts'
                                        value={purchaseAmount} 
                                        type='text' 
                                        onKeyPress={e => validateAmount(e)} 
                                        onInput={e => setPurchaseAmount(e.target.value)}
                                        placeholder="0.0"
                                    />
                                </div>
                                <div className='funding-asset-display'>
                                    <div className='option-container' >
                                        <div>
                                            <img src={fundingAssetMap[fundingAsset]} alt="" className='option-img'/>
                                        </div>
                                        <div className='option-text'>
                                            {fundingAsset}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className='purchase-interval-container'>
                                <div className='title-container__interval'>
                                    Purchase Interval
                                </div>
                                <div className='selector-container__interval'>
                                    <Select 
                                        options={intervalOptions}
                                        styles={selectStyles}
                                        onChange={purchaseIntervalChange}
                                        placeholder={<div>Select interval</div>}
                                        formatOptionLabel={asset => (
                                        <div className='option-container'>
                                            <div className='option-text'>
                                                {asset.label}
                                            </div>
                                        </div>
                                        )}
                                    />
                                </div>
                                <div className='interval-spacing-block'></div>
                            </div>
                        </div>
                        <div className='button-wrapper__inititate-strategy'>
                            <button className='button__initiate-strategy'>
                                Initiate Strategy
                            </button>
                        </div>
                    </div>
                    <div className='deployment-schedule-container'>
                        <div className='chart-container'>
                            <Bar type='bar' options={chartOptions} data={deploymentSchedule} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Deposit;