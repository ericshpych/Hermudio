function isTruthyFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function isFalsyFlag(value) {
  return value === false || value === 0 || value === '0' || value === 'false';
}

function isCliSongPlayable(song) {
  if (!song) return false;

  const hasPlayFlag = song.playFlag !== undefined && song.playFlag !== null;
  const hasCanPlay = song.canPlay !== undefined && song.canPlay !== null;
  const hasVipFlag = song.vipFlag !== undefined && song.vipFlag !== null;

  if (hasPlayFlag && isFalsyFlag(song.playFlag)) return false;
  if (hasCanPlay && isFalsyFlag(song.canPlay)) return false;
  if (hasVipFlag && isTruthyFlag(song.vipFlag)) return false;

  if (hasPlayFlag) return isTruthyFlag(song.playFlag);
  if (hasCanPlay) return isTruthyFlag(song.canPlay);
  if (hasVipFlag) return isFalsyFlag(song.vipFlag);

  return false;
}

function filterPlayableCliSongs(songs) {
  return (songs || []).filter(isCliSongPlayable);
}

module.exports = {
  isCliSongPlayable,
  filterPlayableCliSongs
};
