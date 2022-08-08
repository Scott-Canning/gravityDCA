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
    valueContainer: (provided, state) => ({
        ...provided,
        backgroundColor: state.hasValue ? 'rgb(64, 64, 64)': 'rgb(141, 213, 128)',
        height: 45,
        padding: 1,
        borderRadius: 10
    }),
    indicatorsContainer: (_, state) => ({
        backgroundColor: state.hasValue ? 'rgb(64, 64, 64)': 'rgb(141, 213, 128)',
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
        width: state.hasValue ? 168 : 168,
        border: '0px solid',
        boxShadow: 'none',
        borderRadius: 10,
        backgroundColor: state.hasValue ? 'rgb(64, 64, 64)' : 'rgb(141, 213, 128)',
    }),
}