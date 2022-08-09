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
        height: 45,
        padding: 1,
        borderRadius: 10
    }),
    indicatorsContainer: () => ({
        borderWidth: '0px',
        borderRadius: 10,
    }),
    placeholder: (provided) => ({
        ...provided,
        color: 'white',
        fontFamily: 'menlo',
        paddingLeft: 8,
        fontSize: 13,
    }),
    control: (provided, state) => ({
        ...provided,
        backgroundColor: state.hasValue ? 'rgb(64, 64, 64)' : 'rgb(141, 213, 128)',
        transition: 300,
        width: 168,
        border: '0px solid',
        boxShadow: 'none',
        borderRadius: 10,
    }),
}