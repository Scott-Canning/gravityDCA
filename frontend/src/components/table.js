import React from 'react';
import { useTable } from "react-table";
import './styles/table.css';

const Table = ({ columns, data, getTrProps = props => props}) => {
    const {
        getTableProps,      // table props from react-table
        getTableBodyProps,  // table body props from react-table
        rows,               // rows for the table based on the data passed
        prepareRow          // Prepare the row (this function needs to be called for each row before getting the row props)
    } = useTable({
        columns,
        data,
    });

    return (
        <div className='table-container'>
            <table {...getTableProps()} className='table'>
                <tbody {...getTableBodyProps()} className='table-body'>
                {rows.map((row, i) => {
                    prepareRow(row);
                    return (
                    <tr key={i} {...row.getRowProps()}  {...getTrProps(row)}>
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