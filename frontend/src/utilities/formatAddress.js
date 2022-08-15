export function formatAddress(value, length = 4) {
    return `${value.substring(0, length + 2)}...${value.substring(value.length - length)}`
}