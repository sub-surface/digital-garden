import React from "react"
import styles from "./BroadsheetColumns.module.scss"

interface Props {
  children: React.ReactNode
  cols?: 2 | 3
}

export function BroadsheetColumns({ children, cols = 2 }: Props) {
  return (
    <div className={`${styles.columns} ${cols === 3 ? styles.cols3 : styles.cols2}`}>
      {children}
    </div>
  )
}
