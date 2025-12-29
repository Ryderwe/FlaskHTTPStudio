import socket
import ipaddress
from urllib.parse import urlparse

PRIVATE_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

DEFAULT_ALLOWED_PORTS = {80, 443}


def _is_ip_public(ip: ipaddress._BaseAddress) -> bool:
    return not any(ip in n for n in PRIVATE_NETS)


def resolve_all_ips(hostname: str):
    infos = socket.getaddrinfo(hostname, None)
    ips = []
    for _, _, _, _, sockaddr in infos:
        ip_str = sockaddr[0]
        try:
            ips.append(ipaddress.ip_address(ip_str))
        except ValueError:
            pass
    return ips


def validate_public_url(url: str, allowed_ports=None) -> tuple[bool, str]:
    """
    Strong SSRF guard:
    - only http/https
    - hostname must resolve to public IPs
    - port must be in allowlist (default 80/443)
    - blocks localhost, *.local, single-label host
    """
    allowed_ports = allowed_ports or DEFAULT_ALLOWED_PORTS
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https"):
            return False, "仅允许 http/https URL"
        if not p.hostname:
            return False, "URL 缺少 hostname"
        host = p.hostname.strip().lower()

        # block obvious local names
        if host in ("localhost",):
            return False, "禁止访问 localhost"
        if host.endswith(".local"):
            return False, "禁止访问 .local 域"
        if "." not in host:
            return False, "禁止无点域名（单标签主机名）"

        port = p.port
        if port is None:
            port = 443 if p.scheme == "https" else 80
        if port not in allowed_ports:
            return False, f"端口 {port} 不在允许列表（{sorted(allowed_ports)}）"

        # if direct IP
        try:
            ip = ipaddress.ip_address(host)
            if not _is_ip_public(ip):
                return False, "禁止访问内网/保留网段 IP"
            return True, ""
        except ValueError:
            pass

        ips = resolve_all_ips(host)
        if not ips:
            return False, "DNS 解析失败"
        if not all(_is_ip_public(ip) for ip in ips):
            return False, "DNS 解析到内网/保留网段地址，已阻止"

        return True, ""
    except Exception as e:
        return False, f"URL 校验失败：{e}"
