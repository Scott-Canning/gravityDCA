import React from 'react';
import { useTable } from "react-table";
import './styles/table.css';

const Table = ({ columns, data }) => {

    const {
        getTableProps,      // table props from react-table
        getTableBodyProps,  // table body props from react-table
        headerGroups,       // headerGroups, if your table has groupings
        rows,               // rows for the table based on the data passed
        prepareRow          // Prepare the row (this function needs to be called for each row before getting the row props)
    } = useTable({
        columns,
        data
    });

    return (
        <div className='table-container'>
            <table {...getTableProps()} className='table'>
                <thead className='table-head'>
                {headerGroups.map(headerGroup => (
                    <tr {...headerGroup.getHeaderGroupProps()}>
                    {headerGroup.headers.map(column => (
                        <th {...column.getHeaderProps()}>{column.render("Header")}</th>
                    ))}
                    </tr>
                ))}
                </thead>
                <tbody {...getTableBodyProps()} className='table-body'>
                {rows.map((row, i) => {
                    prepareRow(row);
                    return (
                    <tr {...row.getRowProps()}>
                        {row.cells.map(cell => {
                        return <td {...cell.getCellProps()}>{cell.render("Cell")}</td>;
                        })}
                    </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );
}

export default Table;