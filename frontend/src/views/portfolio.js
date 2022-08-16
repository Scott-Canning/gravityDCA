import React, { useMemo, useState, useEffect } from 'react';
import './styles/portfolio.css';
import Header from '../components/header';
import Menu from '../components/menu';
import Table from '../components/table';
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
import { fundingAssetMap } from '../utilities/fundingAssetMap';
import { pairIdMap } from '../utilities/pairIdMap';
import useMetaMask from '../hooks/MetaMask.js';
import { strategyFactoryAddr } from '../utilities/addresses';
import strategyFactoryABI from '../utilities/abis/strategyFactoryABI.json';
const { ethers } = require('ethers');

const PAIR_COUNT = 6;

const Portfolio = () => {
    const [selectedRow, setSelectedRow] = useState("");
    const [selectedPairId, setSelectedPairId] = useState(0);
    const [pairIdFrom, setPairIdFrom] = useState("");
    const [accountStrategies, setAccountStrategies] = useState([]);
    const [strategyData, setStrategyData] = useState({});
    const [strategyLabels, setStrategyLabels] = useState({});

    const { account, isActive, library } = useMetaMask();

    const getSigner = async () => {
        try {
            if(library) {
                const signer = await library.getSigner();
                return signer;
            }
        } catch(error) {
            console.log('Unable to get signer: ', error)
        }
    }

    const getAccountStrategies = async () => {
        setAccountStrategies([]);
        const signer = await getSigner();
        const contractInstance = new ethers.Contract(strategyFactoryAddr, strategyFactoryABI, signer);

        for(let i = 1; i <= PAIR_COUNT; i++) {
            const strategyDetails = await contractInstance.getStrategyDetails(account, i);
            const stratNextSlot = ethers.BigNumber.from(strategyDetails.nextSlot).toNumber();
            const targetBalance = ethers.BigNumber.from(strategyDetails.targetBalance).toNumber();
            // const interval = ethers.BigNumber.from(strategyDetails.interval).toNumber();
            // const purchaseAmount = ethers.utils.formatUnits(strategyDetails.purchaseAmount, 18);
            const purchasesRemaining = ethers.utils.formatUnits(strategyDetails.purchasesRemaining, 0);
            
            let status = "Live";
            let nextPurchase = stratNextSlot;
            if(purchasesRemaining === 0) {
                status = "Ended";
                nextPurchase = "NA";
            }

            const strategy = {
                "pair_id": i,
                "status": status,
                "balance": targetBalance,
                "next_purchase": nextPurchase,
                "remaining": purchasesRemaining
            }

            if(targetBalance > 0 || purchasesRemaining > 0) {
                setAccountStrategies(oldArray => [...oldArray, strategy]);
            }
        }
    }

    useEffect(() => {
        getAccountStrategies();
    }, [isActive])

    const getDeploymentSchedule = async () => {
        const signer = await getSigner();
        const contractInstance = new ethers.Contract(strategyFactoryAddr, strategyFactoryABI, signer);
        const purchaseSchedule = await contractInstance.getPurchaseSchedule(account, selectedPairId);
        const [ purchaseSlots, purchaseAmounts ] = purchaseSchedule;
        const purchaseSlot = ethers.BigNumber.from(await contractInstance.purchaseSlot()).toNumber();
 
        let date = new Date();
        const noon = new Date().setHours(12, 0, 0, 0);
        if(date > noon) {
            date = add(date, {
                year: 0,
                month: 0,
                days: 1
            })
        }

        const purchaseAmountsFormat = [];
        const purchaseDatesFormat = [];
        for(let i = 0; i < purchaseSlots.length; i++) {
            purchaseAmountsFormat[i] = ethers.utils.formatUnits(purchaseAmounts[i], 18);
            const slotDelta = ethers.BigNumber.from(purchaseSlots[i]).toNumber() - purchaseSlot;
            const nextDate = add(date, {
                year: 0,
                month: 0,
                days: slotDelta
            })
            const formattedDate = (getMonth(nextDate) + 1) + '/' + getDate(nextDate) + '/' + getYear(nextDate);            
            purchaseDatesFormat[i] = formattedDate;
        }

        if(purchaseAmounts) {
            setStrategyData({...strategyData, [selectedPairId]: purchaseAmountsFormat});
            setStrategyLabels({...strategyLabels, [selectedPairId]: purchaseDatesFormat});
        }
    }

    const setRowInfo = (row) => {
        setSelectedRow(row.id);
        setSelectedPairId(row.original.pair_id);
        setPairIdFrom(pairIdMap[row.original.pair_id].from)
    }

    useEffect(() => {
        getDeploymentSchedule();
    }, [selectedRow])

    const columns = [
        {
            Header: "Pair",
            accessor: "pair_id",
            Cell: ({ cell: { value } }) => { return (
                <div className='cell-style-75'>
                    <div className='pair-wrapper'>
                        <img src={fundingAssetMap[pairIdMap[value].from]} className='img__pair-from-token'/>
                        <p><i className="arrow right"></i></p>
                        <img src={fundingAssetMap[pairIdMap[value].to]} className='img__pair-to-token'/>
                    </div>
                </div>
            )},
        },
        {
            Header: "Status",
            accessor: "status",
            Cell: ({ cell: { value } }) => { return (value === 'Live' ? 
                (<div className='cell-style-75'>
                    <div className='live-badge'>Live</div>
                </div>) :
                (<div className='cell-style-75'>
                    <div className='ended-badge'>Ended</div>
                </div>)
            )}
        },
        {
            Header: "Balance",
            accessor: "balance",
            Cell: ({ cell: { row, value } }) => { return (
                <div className='cell-style-120'>
                    <div className='balance-container'>
                        <div className='balance-value'>{ parseFloat(value).toFixed(2) }</div>
                        <div className='divider'></div>
                        <div className='balance-target-asset-image-container'>
                            <img src={fundingAssetMap[pairIdMap[row.original.pair_id].to]} className='img__balance-target-asset'/>
                        </div>
                    </div>
                </div>)},
        },
        {
            Header: "Next Purchase",
            accessor: "next_purchase",
            Cell: ({ cell: { value } }) => { return (value ? 
                (<div className='cell-style-105'>{value}</div>) :
                (<div className='cell-style-105'>NA</div>)
            )},
        },
        {
            Header: "Remaining",
            accessor: "remaining",
            Cell: ({ cell: { value } }) => { return (value ? 
                (<div className='cell-style-105'>{value}</div>) :
                (<div className='cell-style-105'>0</div>)
            )},
        },
        {
            Header: "",
            accessor: "top_up",
            Cell: ({ cell: { row } }) => { return (row.original.status === 'Live' ? 
                (<div className='cell-style'>
                    <div><button className='button-top-up__portfolio'>Top Up</button></div>
                </div>) :
                (<div className='cell-style'>
                    <div></div>
                </div>)
            )},
        },
        {
            Header: "",
            accessor: "withdraw",
            Cell: ({ cell: { row } }) => {return(
                <div className='cell-style'>
                    <button className='button-withdraw__portfolio'>Withdraw</button>
                </div>)},
        },
            // top_up & withdraw -> onClick, pass row.original.pair_id prop
    ];

    ChartJS.register(
        CategoryScale,
        LinearScale,
        BarElement,
        Title,
        Tooltip,
    );

    const deploymentSchedule = {
        labels: strategyLabels[selectedPairId],
        datasets: [
            {
                id: '',
                label: pairIdFrom,
                data: strategyData[selectedPairId],
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
                text: 'Deployment Schedule',
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

    defaults.font.family = 'futura';
    defaults.color = 'rgb(215, 211, 211)';

    return (
        <div className='content__portfolio'>
            <div>
                <Header/>
            </div>
            <div>
                <div className='menu-wrapper__portfolio'>
                    <Menu/>
                </div>
                <div className='portfolio-container'>
                    <div className='table-header-container__portfolio'>
                        <div className='table-header__portfolio'>
                            <div style={{width: '12px'}}/>
                            <p className='table-header-style-75'>Pair</p>
                            <p className='table-header-style-75'>Status</p>
                            <p className='table-header-style-120'>Balance</p>
                            <p className='table-header-style-105'>Next Buy</p>
                            <p className='table-header-style-105'>Remaining</p>
                        </div>
                    </div>
                    <div className='strategies-container'>
                        <Table columns={columns} data={accountStrategies} 
                            getTrProps={(row) => ({
                            style: { cursor: "auto" },
                                onClick: () => {
                                    setRowInfo(row);
                                },
                                style: {
                                    background: row.id === selectedRow ? 'rgba(141, 213, 128, 0.546)' : '',
                                    height: row.id === selectedRow ? '50%' : '',
                                    color: row.id === selectedRow ? 'white' : ''
                                }
                            })}
                        />
                    </div>
                    <div className='deployment-schedule-container__portfolio'>
                        <div className='chart-container__portfolio'>
                            <Bar type='bar' options={chartOptions} data={deploymentSchedule}/>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Portfolio;