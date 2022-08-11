import React, { useMemo, useState } from 'react';
import './styles/portfolio.css';
import Header from '../components/header';
import Menu from '../components/menu';
import Table from '../components/table';
import { fundingAssetMap } from '../utilities/fundingAssetMap';
import { pairIdMap } from '../utilities/pairIdMap';

const Portfolio = () => {
    const[selectedRow, setSelectedRow] = useState("");

    const columns = useMemo(
        () => [
            {
                Header: "Pair",
                accessor: "pair_id",
                Cell: ({ cell: { value } }) => { return (
                    <div className='cell-style-75'>
                        <div className='pair-wrapper'>
                            <img src={fundingAssetMap[pairIdMap[value].from]} className='img__pair-from-token'/>
                            <p><i class="arrow right"></i></p>
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
    );
    
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
            "next_purchase": '',
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
                            <div style={{width: '9px'}}/>
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
                                    background: row.id === selectedRow ? 'rgb(141, 213, 128)' : '',
                                    color: row.id === selectedRow ? 'black' : ''
                                }
                            })}
                        />
                    </div>
                    <div className='deployment-schedule-container__portfolio'>

                    </div>
                </div>
            </div>
        </div>
    )
}

export default Portfolio;