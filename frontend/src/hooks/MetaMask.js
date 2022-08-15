import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { injected } from '../utilities/wallet/connectors'
import { useWeb3React } from '@web3-react/core';

export const MetaMaskContext = React.createContext(null)

export const MetaMaskProvider = ({ children }) => {

    const { activate, account, library, active, deactivate } = useWeb3React()
    const [isActive, setIsActive] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        connect().then(val => {
            setIsLoading(true)
        })
    }, [])

    const handleIsActive = useCallback(() => {
        setIsActive(active)
    }, [active])

    useEffect(() => {
        handleIsActive()
    }, [handleIsActive])

    const connect = async () => {
        console.log('Connecting to MetaMask Wallet')
        try {
            await activate(injected)
        } catch(error) {
            console.log('Error establishing connection with MetaMask: ', error)
        }
    }

    const disconnect = async () => {
        console.log('Deactivating...')
        try {
             deactivate()
        } catch(error) {
            console.log('Error disconnecting from MetaMask: ', error)
        }
    }

    const values = useMemo(
        () => ({
            isActive,
            account,
            isLoading,
            connect,
            disconnect,
            library
        }),
        [isActive, isLoading]
    )

    return (
        <MetaMaskContext.Provider value={values}>
            {children}
        </MetaMaskContext.Provider>
    )
}

export default function useMetaMask() {
    const context = React.useContext(MetaMaskContext)

    if (context === undefined) {
        throw new Error('useMetaMask hook must be used with a MetaMaskProvider component')
    }
    return context
}