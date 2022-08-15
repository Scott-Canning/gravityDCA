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

const PAIR_COUNT = 6

const Portfolio = () => {
    const [selectedRow, setSelectedRow] = useState("");
    const [chartLabels, setChartLabels] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [userData, setUserData] = useState({});

    // FORMAT -> pairId : {...}
    // const strategyDetails = {
    //     1 : {
    //         nextSlot: 12,
    //         targetBalance: 1000,
    //         purchaseInterval: 7,
    //         purchaseAmount: 10000,
    //         purchasesRemaining: 5,
    //         purchaseSlots: [],
    //         purchaseAmounts: []
    //     },
    //     2 : {
    //         nextSlot: 12,
    //         targetBalance: 1000,
    //         purchaseInterval: 7,
    //         purchaseAmount: 10000,
    //         purchasesRemaining: 5,
    //         purchaseSlots: [],
    //         purchaseAmounts: []
    //     }
    // }

    const getUserData = async (user) => {
        for(let i = 0; i < PAIR_COUNT; i++) {
            // [LEFT OFF]
        }
        const purchaseSchedule = await strategyFactory.getPurchaseSchedule(user, pair1Id);
        const [ purchaseSlots, purchaseAmounts ] = purchaseSchedule;

        const expPurchaseSlots = [];
        const expPurchaseCount = Math.ceil(deposit1 / purchase1);
        for(let i = 0; i < expPurchaseCount; i++) {
            expPurchaseSlots[i] = i + 1;
        }
        
        const remainder = deposit1 % purchase1;
        for(let i = 0; i < expPurchaseCount; i++) {
            const slot = ethers.BigNumber.from(purchaseSlots[i]).toNumber();
            assert.equal(slot, expPurchaseSlots[i]);

            const amount = ethers.utils.formatUnits(purchaseAmounts[i], 18);
            if(remainder > 0 && (i === expPurchaseCount - 1)) {
                assert.equal(amount, remainder);
            } else {
                assert.equal(amount, purchase1);
            }
        }
    }

    const fundingAmount = 10000;
    const purchaseAmount = 1000;
    const purchaseInterval = 7;

    useEffect(() => {
        calcDeploymentSchedule();
    }, [selectedRow])

    const columns = [
    // = useMemo(
    //     () => [
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
        ]
    // );
    
    const data = [
        {
            "pair_id": 1,
            "status": "Live",
            "balance": 12.25,
            "next_purchase": '8/30/22',
            "remaining": 7
        },
        {
            "pair_id": 2,
            "status": "Ended",
            "balance": 2.21,
            "next_purchase": '',
            "remaining": 0
        },
        {
            "pair_id": 3,
            "status": "Live",
            "balance": 5.01,
            "next_purchase": '9/15/22',
            "remaining": 0
        },
        {
            "pair_id": 4,
            "status": "Ended",
            "balance": 1000.50,
            "next_purchase": '',
            "remaining": 0
        },
        {
            "pair_id": 5,
            "status": "Live",
            "balance": 3.72,
            "next_purchase": '9/1/22',
            "remaining": 5
        },
        {
            "pair_id": 6,
            "status": "Ended",
            "balance": 2.21,
            "next_purchase": '',
            "remaining": 0
        },
        // {
        //     "pair_id": 2,
        //     "status": "Live",
        //     "balance": 2.21,
        //     "next_purchase": '',
        //     "remaining": 0
        // }
    ];

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
                label: 'WETH',
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
                        <Table columns={columns} data={data} 
                            getTrProps={(row) => ({
                            style: { cursor: "auto" },
                                onClick: () => {
                                    setSelectedRow(row.id);
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
                            <Bar type='bar' options={chartOptions} data={deploymentSchedule} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Portfolio;