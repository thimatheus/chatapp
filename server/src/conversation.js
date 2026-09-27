export function dmKey(a, b) {
  const [x, y] = [a, b].sort((n, m) => n - m);
  return `dm:${x}:${y}`;
}

export function groupKey(id) {
  return `group:${id}`;
}

export function channelKey(id) {
  return `channel:${id}`;
}

// Deriva a chave de conversa e a "room" do socket a partir de uma linha de mensagem
export function keyForMessageRow(row) {
  if (row.group_id) return groupKey(row.group_id);
  if (row.channel_id) return channelKey(row.channel_id);
  return dmKey(row.sender_id, row.recipient_id);
}
