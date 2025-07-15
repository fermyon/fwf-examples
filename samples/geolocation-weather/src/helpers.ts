const getClientAddressFromRequest = (req: Request): string | null => {
    const clientAddress = req.headers.get("spin-client-addr");
    if (clientAddress) {
      return clientAddress;
    }
    return req.headers.get("true-client-ip");
};

const cleanupIpAddress = (input: string): string => {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv4RegexWithPort = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
    const ipv6Regex = /^([a-fA-F0-9:]+)$/; 
    const ipv6WithPortRegex = /^\[([a-fA-F0-9:]+)\]:\d+$/;
  
    if (ipv4RegexWithPort.test(input)) {
      return input.split(':')[0];
    } else if (ipv6WithPortRegex.test(input)) {
      const match = RegExp(ipv6WithPortRegex).exec(input);
      return match ? match[1] : input;
    } else if (ipv4Regex.test(input) || ipv6Regex.test(input)) {
        return input;
    } else {
      console.log("Invalid IP address", input);
      return input;
    }
};

export {
    getClientAddressFromRequest,
    cleanupIpAddress
};
