import {BlockList,isIP} from 'node:net';
const normalized=(ip:string)=>ip.startsWith('::ffff:')&&isIP(ip.slice(7))===4?ip.slice(7):ip;
export class TrustedProxyPolicy {
  private readonly blocks=new BlockList();
  constructor(cidrs:readonly string[]=[]){for(const cidr of cidrs){const [address,prefix,...extra]=cidr.split('/'),family=isIP(address);if(!family||extra.length||!/^\d+$/.test(prefix??'')||Number(prefix)>(family===4?32:128))throw new Error('INVALID_PROXY_CIDR');this.blocks.addSubnet(address,Number(prefix),family===4?'ipv4':'ipv6');}}
  private trusted(ip:string){const family=isIP(ip);return !!family&&this.blocks.check(ip,family===4?'ipv4':'ipv6');}
  resolve(peer:string,forwarded:string|undefined):string {
    let current=normalized(peer);if(!isIP(current))throw new Error('TRUSTED_IP_REQUIRED');
    if(!this.trusted(current)||!forwarded)return current;
    const hops=forwarded.split(',').map(ip=>normalized(ip.trim()));if(hops.some(ip=>!isIP(ip)))throw new Error('TRUSTED_IP_REQUIRED');
    for(const hop of hops.reverse()){if(!this.trusted(current))break;current=hop;}return current;
  }
}
