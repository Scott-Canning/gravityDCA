export const selectStyles = {
    menu: (provided) => ({
        ...provided,
        width: 145,
        padding: 0,
        backgroundColor: 'rgb(64, 64, 64)',
    }),
    container: (provided) => ({
        ...provided,
        backgroundColor: 'black',
        borderColor: 'black',
    }),
    valueContainer: (provided) => ({
        ...provided,
        backgroundColor: 'rgb(64, 64, 64)',
        height: 45,
        padding: 1,
        borderRadius: 10
    }),
    indicatorsContainer: (provided) => ({
        backgroundColor: 'rgb(64, 64, 64)',
        borderWidth: '0px',
        borderRadius: 10,
        padding: 0
    }),
    placeholder: (provided) => ({
        ...provided,
        color: 'white',
        fontFamily: 'futura',
        paddingLeft: 23,
    }),
    control: (provided) => ({
        ...provided,
        width: 155,
        border: '0px solid',
        boxShadow: 'none',
        borderRadius: 10,
        backgroundColor: 'rgb(64, 64, 64)'
    }),
}