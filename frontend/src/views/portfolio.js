import React, { useMemo } from 'react';
import './styles/portfolio.css';
import Header from '../components/header';
import Menu from '../components/menu';
import Table from '../components/table';
import { fundingAssetMap } from '../utilities/fundingAssetMap';
import { pairIdMap } from '../utilities/pairIdMap';

const Portfolio = () => {

    const columns = useMemo(
        () => [
                {
                    Header: "Pair",
                    accessor: "pair_id",
                    Cell: ({ cell: { value } }) => {return (
                        <div>
                            <img src={fundingAssetMap[pairIdMap[value].from]} className='img__pair-from-token'/>
                            <img src={fundingAssetMap[pairIdMap[value].to]} className='img__pair-to-token'/>
                        </div>
                    )}
                },
                {
                    Header: "Status",
                    accessor: "status",
                    Cell: ({ cell: { value } }) => {return (value === 'Live' ? 
                        (<div className='live-badge'>Live</div>) :
                        (<div className='ended-badge'>Ended</div>)
                    )}
                },
                {
                    Header: "Balance",
                    accessor: "balance",
                    Cell: ({ cell: { row, value } }) => {return (
                    <div className='balance-container'>
                        <div className='balance-value'>{ value }</div>
                        <div className='divider'></div>
                        <div className='balance-target-asset-image-container'>
                            <img src={fundingAssetMap[pairIdMap[row.original.pair_id].to]} className='img__balance-target-asset'/>
                        </div>
                    </div>)},
                },
                {
                    Header: "Next Purchase",
                    accessor: "next_purchase",
                    Cell: ({ cell: { value } }) => value || "NA"
                },
                {
                    Header: "Remaining",
                    accessor: "remaining",
                    Cell: ({ cell: { value } }) => value || "0"
                },
                {
                    Header: "",
                    accessor: "top_up",
                    Cell: ({ cell: { row, value } }) => {return (row.original.status === 'Live' ? 
                        (<div><button className='button-top-up__portfolio'>Top Up</button></div>) :
                        (<div></div>)
                    )},
                },
                {
                    Header: "",
                    accessor: "withdraw",
                    Cell: () => {return(<div><button className='button-withdraw__portfolio'>Withdraw</button></div>)},
                },
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
        // {
        //     "pair_id": 6,
        //     "status": "Ended",
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
                    {/* <div className='title-container__portfolio'>
                        <p className='title__portfolio'>Your Strategies</p>
                    </div> */}
                    <div className='strategies-container'>
                        <Table columns={columns} data={data} />
                    </div>
                    <div className='deployment-schedule-container__portfolio'>

                    </div>
                </div>
            </div>
        </div>
    )
}

export default Portfolio;