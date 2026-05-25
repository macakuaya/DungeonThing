import { TILES } from '../tiles'
import { DraggableTile } from './DraggableTile'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-tiles">
        {TILES.map((tile) => (
          <DraggableTile key={tile.id} tile={tile} />
        ))}
      </div>
    </aside>
  )
}
