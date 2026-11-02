import helpIcon from "../../assets/icons/help-icon.svg";
import css from "./Notice.module.css";
import React from "react";

interface NoticeProps {
    children: React.ReactNode;
    onClick: () => void;
}

export function Notice({children, onClick}: NoticeProps) {
    return (
        <div className={css.notice}>
            <span className={css.notice__info}>
                <img src={helpIcon} alt="helpIcon" />
                {children}
            </span>
          <button className={css.notice__btn + " gradient-border"} onClick={onClick}>Got it</button>
        </div>
    );
}